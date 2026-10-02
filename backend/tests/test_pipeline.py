"""Run from backend/:  python -m unittest tests.test_pipeline -v   (needs gcc or clang on PATH)"""
import os
import unittest

os.environ.setdefault("GC_RUN_TIMEOUT", "2")
os.environ.setdefault("GC_RUNS", "3")

from services import workflow  # noqa: E402
from services.pattern_detection_service import apply_hoisting, detect_patterns  # noqa: E402
from services.safety import SourceRejected, validate_source  # noqa: E402

ACCEPT = """#include <stdio.h>

int main() {
    int a = 5;
    int b = 10;
    int result = 0;

    for(int i = 0; i < 1000000; i++) {
        result = a * b;
    }

    printf("%d", result);

    return 0;
}
"""


class Pipeline(unittest.TestCase):
    def test_acceptance_flow(self):
        r = workflow.analyze_source(ACCEPT, "clang", "O0")
        self.assertTrue(r["compilation"]["success"])
        self.assertEqual(r["performance"]["stdout"], "50")
        self.assertTrue(r["energy"]["is_estimated"] and r["carbon"]["is_estimated"])
        self.assertEqual(r["patterns"][0]["pattern"], "Repeated computation inside loop")
        self.assertIsNotNone(r["green_score"]["score"])
        o = workflow.optimize(ACCEPT, "clang", "O0", r["analysis_id"])
        self.assertEqual(o["status"], "ok")
        self.assertEqual(o["verification"]["status"], "verified")
        self.assertEqual(o["optimized"]["performance"]["stdout"], "50")
        self.assertGreater(o["optimized"]["green_score"]["score"], r["green_score"]["score"])
        self.assertEqual(o["diff"]["optimized_changed_lines"], [8, 10])

    def test_compile_error(self):
        r = workflow.analyze_source("int main( { return 0 }", "gcc", "O2")
        self.assertFalse(r["compilation"]["success"])
        self.assertTrue(r["compilation"]["errors"])
        self.assertFalse(r["performance"]["executed"])
        self.assertIsNone(r["green_score"]["score"])

    def test_warning_captured(self):
        r = workflow.analyze_source('#include <stdio.h>\nint main(){int x; printf("%d",5); return 0;}', "gcc", "O0")
        self.assertTrue(any("unused" in w["message"] for w in r["compilation"]["warnings"]))

    def test_timeout(self):
        r = workflow.analyze_source("int main(){ for(;;){} }", "gcc", "O0")
        self.assertTrue(r["performance"]["timed_out"])
        self.assertIsNone(r["energy"]["energy_joules"])

    def test_crash(self):
        r = workflow.analyze_source("#include <stdlib.h>\nint main(){ int *p = NULL; *p = 1; return 0; }", "gcc", "O0")
        self.assertTrue(r["performance"]["crashed"])

    def test_forbidden(self):
        for bad in ('#include <stdlib.h>\nint main(){ system("ls"); }', '#include "x.h"\nint main(){}',
                    "#include <unistd.h>\nint main(){}"):
            with self.assertRaises(SourceRejected):
                validate_source(bad)

    def test_missing_compiler_reports_setup(self):
        from services import compiler_service as cs
        orig = cs._find
        cs._find = lambda n: None
        try:
            r = workflow.compile_only(ACCEPT, "clang", "O2")
        finally:
            cs._find = orig
        self.assertFalse(r["success"])
        self.assertTrue(r["setup_required"])

    def test_bad_optimization_fails_verification(self):
        r = workflow.analyze_source(ACCEPT, "gcc", "O0")
        bad = ACCEPT.replace("a * b", "a + b")
        o = workflow.optimize(ACCEPT, "gcc", "O0", r["analysis_id"], optimized_code=bad)
        self.assertEqual(o["verification"]["status"], "failed")

    def test_optimized_that_does_not_compile(self):
        o = workflow.optimize(ACCEPT, "gcc", "O0", optimized_code="int main(){ return }")
        self.assertEqual(o["verification"]["status"], "failed")

    def test_unsafe_hoists_are_skipped(self):
        for body in ("result = a * b; a++;", "result = a / b;", "result = a * result;", "result = foo(a) * b;"):
            src = f"int foo(int x){{return x;}}\nint main(){{ int a=2,b=3,result=0;\n for(int i=0;i<5;i++){{ {body} }}\n return result; }}"
            self.assertEqual(apply_hoisting(src)[0], src, body)

    def test_other_patterns(self):
        src = '''#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
int main(){ char s[10]="abc"; double x = 2.0; double y = 0;
  for(int i=0;i<strlen(s);i++){ printf("%d", i); int *p = malloc(4); y = sqrt(x); }
  return 0; }'''
        names = {p["pattern"] for p in detect_patterns(src)}
        self.assertTrue({"Inefficient loop condition", "Excessive console I/O", "Unnecessary memory allocation",
                         "Unnecessary repeated work", "Allocation without free"} <= names, names)

    def test_no_false_positive_when_invariant_changes(self):
        src = "int main(){ int a=1,b=2,r=0; for(int i=0;i<9;i++){ r = a*b; a = i; } return r; }"
        self.assertEqual(detect_patterns(src), [])


if __name__ == "__main__":
    unittest.main()

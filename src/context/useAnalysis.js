import { useContext } from "react";
import { AnalysisContext } from "./analysisContext";

export function useAnalysis() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error("useAnalysis must be used inside <AnalysisProvider>");
  return ctx;
}

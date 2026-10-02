"""Energy = Power x Time. ESTIMATED from a configurable power assumption (no hardware counters)."""
from config import POWER_WATTS


def estimate_energy(execution_time_ms):
    if execution_time_ms is None:
        return {"energy_joules": None, "is_estimated": True, "available": False,
                "method": "execution_time x configured_power",
                "reason": "No execution time was measured, so energy cannot be estimated."}
    joules = POWER_WATTS * (execution_time_ms / 1000.0)
    return {
        "energy_joules": joules, "is_estimated": True, "available": True,
        "method": "execution_time x configured_power",
        "assumptions": {"power_watts": POWER_WATTS, "time_basis": "median wall-clock execution time"},
        "disclaimer": ("Estimated energy, not a hardware measurement. It assumes the program draws a constant "
                       f"{POWER_WATTS:g} W while running (set GC_POWER_WATTS to change)."),
    }

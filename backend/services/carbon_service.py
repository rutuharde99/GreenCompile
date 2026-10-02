"""Carbon = Energy(kWh) x carbon intensity. ESTIMATED with a configurable grid intensity."""
from config import CARBON_INTENSITY_G_PER_KWH


def estimate_carbon(energy_joules):
    if energy_joules is None:
        return {"carbon_gco2e": None, "energy_kwh": None, "is_estimated": True, "available": False,
                "carbon_intensity_gco2e_per_kwh": CARBON_INTENSITY_G_PER_KWH}
    kwh = energy_joules / 3_600_000.0
    return {
        "carbon_gco2e": kwh * CARBON_INTENSITY_G_PER_KWH, "energy_kwh": kwh,
        "carbon_intensity_gco2e_per_kwh": CARBON_INTENSITY_G_PER_KWH, "is_estimated": True, "available": True,
        "method": "energy_kWh x carbon_intensity",
        "disclaimer": ("Estimated carbon. Uses a configurable grid carbon intensity "
                       f"({CARBON_INTENSITY_G_PER_KWH:g} gCO2e/kWh, set GC_CARBON_INTENSITY); "
                       "real intensity varies by country, grid mix and time of day."),
    }

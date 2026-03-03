"""Solar ROI (Return on Investment) engine.

Calculates solar panel financial and environmental returns based on
NREL irradiance data, system size, roof area, and electricity rates.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

# US average CO2 intensity: ~0.386 kg CO2/kWh (EPA eGRID 2022)
_CO2_KG_PER_KWH = 0.386

# Monthly insolation weight fractions (Northern Hemisphere, temperate climate)
# Derived from typical PVWatts monthly production ratios — they sum to 1.0
_MONTH_WEIGHTS = [
    0.055,  # Jan
    0.063,  # Feb
    0.083,  # Mar
    0.093,  # Apr
    0.100,  # May
    0.103,  # Jun
    0.103,  # Jul
    0.096,  # Aug
    0.083,  # Sep
    0.073,  # Oct
    0.058,  # Nov
    0.049,  # Dec
]

# Default install cost per installed watt (USD) — US average 2024
_DEFAULT_COST_PER_WATT = 2.80


@dataclass
class ROIResult:
    """Solar panel system financial and environmental return."""
    system_kw: float
    roof_area_sqm: float
    rate_per_kwh: float

    annual_kwh: float               # Estimated annual AC production
    system_cost_usd: float          # Upfront install cost
    annual_savings_usd: float       # Electricity bill savings per year
    payback_years: float            # Simple payback period
    ten_year_savings_usd: float     # Net savings after 10 years (after system cost)
    twenty_year_savings_usd: float  # Net savings after 20 years
    co2_offset_kg: float            # Annual CO2 offset in kg

    monthly_production_kwh: list[float] = field(default_factory=list)  # 12 months

    # Derived display helpers
    @property
    def payback_years_display(self) -> str:
        if self.payback_years >= 100:
            return "N/A"
        return f"{self.payback_years:.1f}"

    @property
    def co2_offset_trees(self) -> int:
        """Approximate equivalent trees planted (1 tree ≈ 21 kg CO2/yr)."""
        return int(self.co2_offset_kg / 21)


def calculate_solar_roi(
    peak_sun_hours: float,
    roof_area_sqm: float = 50.0,
    system_kw: float = 6.0,
    rate_per_kwh: float = 0.13,
    install_cost_per_watt: float = _DEFAULT_COST_PER_WATT,
) -> ROIResult:
    """Compute solar panel ROI for given site + system parameters.

    Args:
        peak_sun_hours:     Average daily peak sun hours (from NREL/pvlib).
        roof_area_sqm:      Available roof area (m²). Used to cap system size.
        system_kw:          Desired system size (DC kW).
        rate_per_kwh:       Local electricity rate (USD/kWh).
        install_cost_per_watt: Installed cost per watt (USD). Default 2.80.

    Returns:
        ROIResult with financial and environmental metrics.
    """
    # Cap system size by roof area (typical panel: ~1.7 m² / 400 W)
    max_kw_by_roof = (roof_area_sqm / 1.7) * 0.40  # kW
    effective_kw = min(system_kw, max_kw_by_roof)

    # Annual production (DC→AC derate 0.80; performance ratio)
    annual_kwh = effective_kw * peak_sun_hours * 365 * 0.80

    # System cost
    system_cost = effective_kw * 1000 * install_cost_per_watt

    # Annual savings
    annual_savings = annual_kwh * rate_per_kwh

    # Payback
    payback = system_cost / annual_savings if annual_savings > 0 else 999.0

    # Net savings (simple, no degradation / inflation for clarity)
    ten_yr = annual_savings * 10 - system_cost
    twenty_yr = annual_savings * 20 - system_cost

    # CO2
    co2 = annual_kwh * _CO2_KG_PER_KWH

    # Monthly production
    monthly = [annual_kwh * w for w in _MONTH_WEIGHTS]

    return ROIResult(
        system_kw=round(effective_kw, 2),
        roof_area_sqm=roof_area_sqm,
        rate_per_kwh=rate_per_kwh,
        annual_kwh=round(annual_kwh, 1),
        system_cost_usd=round(system_cost, 2),
        annual_savings_usd=round(annual_savings, 2),
        payback_years=round(payback, 1),
        ten_year_savings_usd=round(ten_yr, 2),
        twenty_year_savings_usd=round(twenty_yr, 2),
        co2_offset_kg=round(co2, 1),
        monthly_production_kwh=[round(m, 1) for m in monthly],
    )

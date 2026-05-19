"""Shared chart styling exported with the public data payload."""

from __future__ import annotations

STYLING_VERSION = 1

# Bump STYLING_VERSION only for breaking shape changes to the exported
# ``styling`` block, not for additive optional fields or color changes.
YEAR_COLORS = {
    "2022": "#1e4976",
    "2023": "#e8833a",
    "2024": "#009e73",
    "2025": "#6f4aa0",
    "2026": "#d55e00",
    "2027": "#0072b2",
}

RISK_BANDS = [
    {
        "label": "Very Low",
        "min": None,
        "max": 0.0,
        "color": "#e6f0f5",
        "textColor": "#1e4976",
    },
    {
        "label": "Low",
        "min": 0.0,
        "max": 0.5,
        "color": "#d8e8df",
        "textColor": "#256d4a",
    },
    {
        "label": "Moderate",
        "min": 0.5,
        "max": 1.0,
        "color": "#fff0bf",
        "textColor": "#8a6300",
    },
    {
        "label": "Moderate-High",
        "min": 1.0,
        "max": 1.5,
        "color": "#fbd1a7",
        "textColor": "#a04a14",
    },
    {
        "label": "High",
        "min": 1.5,
        "max": None,
        "color": "#f3b7b2",
        "textColor": "#9a2f29",
    },
]


def indicator_risk_bands() -> list[dict[str, str | float | None]]:
    """Return risk-band thresholds without presentation-only color fields."""

    return [
        {"label": band["label"], "min": band["min"], "max": band["max"]}
        for band in RISK_BANDS
    ]


def export_styling() -> dict[str, object]:
    """Return the stable styling contract included in risk_data.json."""

    return {
        "yearColors": dict(YEAR_COLORS),
        "riskBands": [dict(band) for band in RISK_BANDS],
        "version": STYLING_VERSION,
    }

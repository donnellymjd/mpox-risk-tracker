"""Configuration for public data sources and indicator defaults."""

from __future__ import annotations

import os

NYC_MPOX_PAGE_URL = os.getenv(
    "MPOX_NYC_PAGE_URL",
    "https://www.nyc.gov/site/doh/health/health-topics/mpox.page",
)

NYC_2022_DAILY_URL = os.getenv(
    "MPOX_2022_DAILY_URL",
    "https://raw.githubusercontent.com/nychealth/monkeypox-data/main/trends/cases-by-day.csv",
)

# Historical Datawrapper chart used by NYC before the current weekly chart.
# It is no longer linked from the mpox page, but the public chart remains
# available and provides daily continuity from 2023 through the 2024 baseline.
HISTORICAL_DAILY_CHART_ID = os.getenv("MPOX_HISTORICAL_DAILY_CHART_ID", "5lUBv")

# Optional override for the chart currently embedded on the NYC mpox page.
CURRENT_WEEKLY_CHART_ID = os.getenv("MPOX_CURRENT_WEEKLY_CHART_ID")

USER_AGENT = os.getenv(
    "MPOX_TRACKER_USER_AGENT",
    "d2sci-mpox-risk-tracker/0.1 (+https://d2sci.co)",
)

SMOOTHING_WINDOW_DAYS = int(os.getenv("MPOX_SMOOTHING_WINDOW_DAYS", "14"))
SMOOTHING_STD_DAYS = float(os.getenv("MPOX_SMOOTHING_STD_DAYS", "5"))
RISK_NORMALIZATION_FACTOR = float(os.getenv("MPOX_RISK_NORMALIZATION_FACTOR", "0.04"))

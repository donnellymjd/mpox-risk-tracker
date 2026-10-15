"""Descriptive weekly case-activity stoplights for public tracker clients."""

from __future__ import annotations

import math
from datetime import UTC, date, datetime

import pandas as pd

from .activity import WEEKLY_GROWTH_WEEKS, weekly_growth_percent


RULES = {
    "level": {
        "name": "Recent case level",
        "rule": "Cases in the latest four complete reporting weeks: green below 15, amber 15–59, red 60 or more.",
    },
    "momentum": {
        "name": "Momentum: 4-week vs 13-week average",
        "rule": "Trailing four-week weekly average versus trailing 13-week weekly average: green for an increase of 15% or less (including declines), amber above 15% through 40%, red above 40%. A larger decline is favorable, not an adverse signal.",
    },
    "yearOverYear": {
        "name": "Versus last year",
        "rule": "Trailing 13-week total versus the 13 weeks ending 52 weeks earlier: green when at least 20% lower; red when more than 20% higher, or at least five cases after a zero baseline; amber otherwise.",
    },
}

FIRST_COMPARABLE = {"level": 3, "momentum": 12, "yearOverYear": 64}

def _growth_reading(counts: list[int], end: int) -> dict[str, str]:
    rate = weekly_growth_percent(counts[end - WEEKLY_GROWTH_WEEKS + 1 : end + 1])
    recent_cases = sum(counts[end - 3 : end + 1])
    color = "red" if rate > 15 and recent_cases >= 15 else "amber" if rate > 5 else "green"
    return {"color": color, "value": f"{rate:+.1f}% per week (8-week trend)"}


def _percentage(ratio: float) -> str:
    if not math.isfinite(ratio):
        return "New activity"
    change = math.floor((ratio - 1) * 100 + 0.5)
    return f"{'+' if change > 0 else ''}{change}%"


def _reading(counts: list[int], end: int, key: str) -> dict[str, str]:
    if key == "level":
        recent = sum(counts[end - 3 : end + 1])
        color = "red" if recent >= 60 else "amber" if recent >= 15 else "green"
        return {"color": color, "value": f"{recent} cases / 4 weeks"}

    if key == "momentum":
        four_week_average = sum(counts[end - 3 : end + 1]) / 4
        thirteen_week_average = sum(counts[end - 12 : end + 1]) / 13
        ratio = four_week_average / thirteen_week_average if thirteen_week_average else 1
        color = "red" if ratio > 1.4 else "amber" if ratio > 1.15 else "green"
        return {"color": color, "value": f"{_percentage(ratio)} ({four_week_average:.2f} vs {thirteen_week_average:.2f} weekly avg)"}

    recent = sum(counts[end - 12 : end + 1])
    year_earlier = sum(counts[end - 64 : end - 51])
    ratio = recent / year_earlier if year_earlier else (math.inf if recent else 1)
    if year_earlier == 0:
        color = "red" if recent >= 5 else "amber"
    else:
        color = "green" if recent * 5 <= year_earlier * 4 else "red" if recent * 5 > year_earlier * 6 else "amber"
    return {"color": color, "value": f"{_percentage(ratio)} ({recent} vs {year_earlier} cases)"}


def build_case_stoplight(frame: pd.DataFrame, *, source_url: str | None = None, today: date | None = None) -> dict:
    """Publish weekly growth and three weekly case-activity stoplights."""

    result = {
        "version": 3,
        "as_of": None,
        "four_weeks_ago_date": None,
        "source_url": source_url,
        "rows": [],
        "unavailable_reason": None,
    }
    if not {"week_ending", "cases"}.issubset(frame.columns):
        result["unavailable_reason"] = "The weekly source is missing required columns."
        return result

    weekly = frame[["week_ending", "cases"]].copy()
    weekly["week_ending"] = pd.to_datetime(weekly["week_ending"], errors="coerce").dt.normalize()
    weekly["cases"] = pd.to_numeric(weekly["cases"], errors="coerce")
    weekly = weekly.sort_values("week_ending").reset_index(drop=True)
    if weekly.empty or weekly.isna().any().any() or (weekly["cases"] < 0).any() or (weekly["cases"] % 1 != 0).any():
        result["unavailable_reason"] = "The weekly source contains invalid dates or counts."
        return result
    today = today or datetime.now(UTC).date()
    # A week ending today or later may still be in progress.
    weekly = weekly[weekly["week_ending"].dt.date < today].reset_index(drop=True)
    if weekly.empty:
        result["unavailable_reason"] = "No completed reporting week is available."
        return result
    if weekly["week_ending"].duplicated().any() or (weekly["week_ending"].diff().dropna() != pd.Timedelta(days=7)).any():
        result["unavailable_reason"] = "The weekly source has missing or duplicate reporting weeks."
        return result

    dates = weekly["week_ending"].dt.strftime("%Y-%m-%d").tolist()
    counts = weekly["cases"].astype(int).tolist()
    result["as_of"] = dates[-1]
    if (today - weekly["week_ending"].iloc[-1].date()).days > 14:
        result["unavailable_reason"] = "The latest completed reporting week is more than 14 days old."
        return result
    if len(counts) < 69:
        result["unavailable_reason"] = "At least 69 weekly observations are needed for the four-week-ago year comparison."
        return result

    end = len(counts) - 1
    result["four_weeks_ago_date"] = dates[end - 4]
    growth_reading = _growth_reading(counts, end)
    changed_at = dates[WEEKLY_GROWTH_WEEKS - 1]
    for index in range(end, WEEKLY_GROWTH_WEEKS - 1, -1):
        if _growth_reading(counts, index - 1)["color"] != growth_reading["color"]:
            changed_at = dates[index]
            break
    result["rows"].append({
        "key": "growthIndicator",
        "name": "NYC Mpox Weekly Case Growth Trend",
        "rule": "Estimated weekly change in reported cases from a log(1 + weekly cases) trend fitted across eight complete weeks. Green at 5% or less, amber above 5%, red above 15% only when at least 15 cases occurred in the latest four weeks. A rapid rise on fewer cases stays amber. This is a descriptive trend, not a transmission or personal-risk estimate.",
        "reading": growth_reading,
        "four_weeks_ago": _growth_reading(counts, end - 4),
        "changed_at": changed_at,
    })
    for key, definition in RULES.items():
        reading = _reading(counts, end, key)
        four_weeks_ago = _reading(counts, end - 4, key)
        first = FIRST_COMPARABLE[key]
        changed_at = dates[first]
        for index in range(end, first, -1):
            if _reading(counts, index - 1, key)["color"] != reading["color"]:
                changed_at = dates[index]
                break
        result["rows"].append({
            "key": key,
            "name": definition["name"],
            "rule": definition["rule"],
            "reading": reading,
            "four_weeks_ago": four_weeks_ago,
            "changed_at": changed_at,
        })
    return result

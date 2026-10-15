"""Descriptive weekly case-activity stoplights for public tracker clients."""

from __future__ import annotations

import math

import pandas as pd


RULES = {
    "level": {
        "name": "Recent case level",
        "rule": "Cases in the latest four complete reporting weeks: green below 15, amber 15–39, red 40 or more.",
    },
    "momentum": {
        "name": "Recent direction",
        "rule": "Latest four weeks versus the preceding four: red for at least 50% and five more cases; amber for an increase of at least two cases; green otherwise.",
    },
    "yearOverYear": {
        "name": "Versus last year",
        "rule": "Trailing 13-week total versus the 13 weeks ending 52 weeks earlier: green when at least 20% lower, red when more than 20% higher, amber otherwise.",
    },
}

FIRST_COMPARABLE = {"level": 3, "momentum": 7, "yearOverYear": 64}


def _percentage(ratio: float) -> str:
    if not math.isfinite(ratio):
        return "New activity"
    change = math.floor((ratio - 1) * 100 + 0.5)
    return f"{'+' if change > 0 else ''}{change}%"


def _reading(counts: list[int], end: int, key: str) -> dict[str, str]:
    if key == "level":
        recent = sum(counts[end - 3 : end + 1])
        color = "red" if recent >= 40 else "amber" if recent >= 15 else "green"
        return {"color": color, "value": f"{recent} cases / 4 weeks"}

    if key == "momentum":
        recent = sum(counts[end - 3 : end + 1])
        previous = sum(counts[end - 7 : end - 3])
        ratio = recent / previous if previous else (math.inf if recent else 1)
        increase = recent - previous
        color = "red" if increase >= 5 and ratio >= 1.5 else "amber" if increase >= 2 else "green"
        return {"color": color, "value": f"{_percentage(ratio)} ({recent} vs {previous} cases)"}

    recent = sum(counts[end - 12 : end + 1])
    year_earlier = sum(counts[end - 64 : end - 51])
    ratio = recent / year_earlier if year_earlier else (math.inf if recent else 1)
    color = "green" if ratio < 0.8 else "red" if ratio > 1.2 else "amber"
    return {"color": color, "value": f"{_percentage(ratio)} ({recent} vs {year_earlier} cases)"}


def build_case_stoplight(frame: pd.DataFrame, *, source_url: str | None = None) -> dict:
    """Publish three stoplights from the official, unexpanded weekly case rows."""

    result = {
        "version": 1,
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
    if weekly["week_ending"].duplicated().any() or (weekly["week_ending"].diff().dropna() != pd.Timedelta(days=7)).any():
        result["unavailable_reason"] = "The weekly source has missing or duplicate reporting weeks."
        return result

    dates = weekly["week_ending"].dt.strftime("%Y-%m-%d").tolist()
    counts = weekly["cases"].astype(int).tolist()
    result["as_of"] = dates[-1]
    if len(counts) < 69:
        result["unavailable_reason"] = "At least 69 weekly observations are needed for the four-week-ago year comparison."
        return result

    end = len(counts) - 1
    result["four_weeks_ago_date"] = dates[end - 4]
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

from __future__ import annotations

import pandas as pd

from mpox_tracker.stoplight import build_case_stoplight


def test_case_stoplight_exports_current_prior_and_change_dates() -> None:
    counts = [10] * 52 + [2] * 32 + [1, 4, 6, 5, 8, 13, 9, 11]
    frame = pd.DataFrame({
        "week_ending": pd.date_range("2025-01-04", periods=len(counts), freq="7D"),
        "cases": counts,
    })

    payload = build_case_stoplight(frame, source_url="https://example.org/weekly.csv")
    rows = {row["key"]: row for row in payload["rows"]}

    assert payload["version"] == 1
    assert payload["as_of"] == "2026-10-03"
    assert payload["four_weeks_ago_date"] == "2026-09-05"
    assert payload["source_url"] == "https://example.org/weekly.csv"
    assert payload["unavailable_reason"] is None
    assert rows["level"]["reading"] == {"color": "red", "value": "41 cases / 4 weeks"}
    assert rows["level"]["four_weeks_ago"] == {"color": "amber", "value": "16 cases / 4 weeks"}
    assert rows["level"]["changed_at"] == "2026-10-03"
    assert rows["momentum"]["reading"] == {"color": "red", "value": "+156% (41 vs 16 cases)"}
    assert rows["yearOverYear"]["reading"]["color"] == "green"
    assert rows["yearOverYear"]["reading"]["value"] == "-48% (67 vs 130 cases)"


def test_case_stoplight_hides_status_when_reporting_weeks_are_missing() -> None:
    frame = pd.DataFrame({
        "week_ending": ["2026-09-05", "2026-09-19"],
        "cases": [4, 8],
    })

    payload = build_case_stoplight(frame)

    assert payload["rows"] == []
    assert payload["unavailable_reason"] == "The weekly source has missing or duplicate reporting weeks."

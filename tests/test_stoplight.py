from __future__ import annotations

from datetime import date

import pandas as pd

from mpox_tracker.stoplight import _growth_reading, build_case_stoplight


def test_case_stoplight_exports_current_prior_and_change_dates() -> None:
    counts = [10] * 52 + [2] * 32 + [1, 4, 6, 5, 8, 13, 9, 11]
    frame = pd.DataFrame({
        "week_ending": pd.date_range("2025-01-04", periods=len(counts), freq="7D"),
        "cases": counts,
    })

    payload = build_case_stoplight(frame, source_url="https://example.org/weekly.csv", today=date(2026, 10, 15))
    rows = {row["key"]: row for row in payload["rows"]}

    assert payload["version"] == 3
    assert payload["as_of"] == "2026-10-03"
    assert payload["four_weeks_ago_date"] == "2026-09-05"
    assert payload["source_url"] == "https://example.org/weekly.csv"
    assert payload["unavailable_reason"] is None
    assert len(payload["rows"]) == 4
    assert payload["rows"][0]["key"] == "growthIndicator"
    assert rows["growthIndicator"]["reading"]["color"] == "red"
    assert rows["growthIndicator"]["reading"]["value"].endswith("% per week (8-week trend)")
    assert rows["growthIndicator"]["four_weeks_ago"]["color"] in {"green", "amber", "red"}
    assert rows["growthIndicator"]["changed_at"] <= "2026-10-03"
    assert rows["level"]["reading"] == {"color": "amber", "value": "41 cases / 4 weeks"}
    assert rows["level"]["four_weeks_ago"] == {"color": "amber", "value": "16 cases / 4 weeks"}
    assert rows["level"]["changed_at"] == "2026-09-05"
    assert rows["momentum"]["reading"] == {"color": "red", "value": "+99% (10.25 vs 5.15 weekly avg)"}
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


def test_weekly_growth_colors_include_low_count_safeguard() -> None:
    assert _growth_reading([10] * 8, 7)["color"] == "green"
    assert _growth_reading([1, 1, 1, 1, 2, 3, 4, 5], 7)["color"] == "amber"
    assert _growth_reading([1, 1, 2, 3, 5, 8, 13, 21], 7)["color"] == "red"


def test_recent_case_level_boundaries() -> None:
    from mpox_tracker.stoplight import _reading

    for total, color in [(14, "green"), (15, "amber"), (41, "amber"), (59, "amber"), (60, "red")]:
        assert _reading([0, 0, 0, total], 3, "level")["color"] == color


def test_momentum_thresholds_and_declines() -> None:
    from mpox_tracker.stoplight import _reading

    assert _reading([0] * 13, 12, "momentum")["color"] == "green"
    assert _reading([4] * 9 + [0] * 4, 12, "momentum")["color"] == "green"
    assert _reading([10] * 13, 12, "momentum")["color"] == "green"
    # Four weeks contribute to the 13-week baseline, so calculate exact
    # boundaries from integer totals over both windows.
    assert _reading([17] * 9 + [20] * 4, 12, "momentum")["color"] == "green"
    assert _reading([16] * 9 + [20] * 4, 12, "momentum")["color"] == "amber"
    assert _reading([11] * 9 + [20] * 4, 12, "momentum")["color"] == "red"


def test_missing_weekly_source_hides_incomplete_stoplight() -> None:
    dates = pd.date_range(end="2026-10-03", periods=69, freq="7D")
    frame = pd.DataFrame({"week_ending": dates, "cases": [1] * 69})
    payload = build_case_stoplight(frame.iloc[0:0], today=date(2026, 10, 15))
    assert payload["rows"] == []
    assert "invalid dates or counts" in payload["unavailable_reason"]


def test_year_comparison_exact_green_boundary_and_zero_baseline() -> None:
    dates = pd.date_range(end="2026-10-03", periods=69, freq="7D")
    counts = [0] * 69
    counts[4] = 5
    counts[-1] = 4
    frame = pd.DataFrame({"week_ending": dates, "cases": counts})
    rows = {row["key"]: row for row in build_case_stoplight(frame, today=date(2026, 10, 15))["rows"]}
    assert rows["yearOverYear"]["reading"]["color"] == "green"

    counts[4] = 0
    counts[-1] = 1
    frame["cases"] = counts
    rows = {row["key"]: row for row in build_case_stoplight(frame, today=date(2026, 10, 15))["rows"]}
    assert rows["yearOverYear"]["reading"]["color"] == "amber"

    counts[-1] = 5
    frame["cases"] = counts
    rows = {row["key"]: row for row in build_case_stoplight(frame, today=date(2026, 10, 15))["rows"]}
    assert rows["yearOverYear"]["reading"]["color"] == "red"


def test_in_progress_week_excluded_and_stale_data_suppressed() -> None:
    dates = pd.date_range(end="2026-10-03", periods=69, freq="7D")
    frame = pd.DataFrame({"week_ending": dates, "cases": [1] * 69})
    frame.loc[len(frame)] = {"week_ending": pd.Timestamp("2026-10-17"), "cases": 99}
    payload = build_case_stoplight(frame, today=date(2026, 10, 15))
    assert payload["as_of"] == "2026-10-03"
    assert payload["rows"]

    stale = build_case_stoplight(frame.iloc[:-1], today=date(2026, 10, 25))
    assert stale["rows"] == []
    assert "more than 14 days old" in stale["unavailable_reason"]

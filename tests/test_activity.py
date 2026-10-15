from __future__ import annotations

import pandas as pd

from mpox_tracker.activity import build_activity_series, build_growth_series, weekly_growth_percent


def test_weekly_growth_estimates_eight_week_log_linear_trend() -> None:
    assert weekly_growth_percent([0.0] * 8) == 0.0
    assert weekly_growth_percent([10.0] * 8) == 0.0
    assert weekly_growth_percent([1, 1, 2, 3, 5, 8, 13, 21]) > 15


def test_activity_history_uses_complete_weekly_windows() -> None:
    dates = pd.date_range("2025-06-08", periods=70 * 7, freq="D")
    cases = pd.DataFrame({"date": dates, "cases": [1.0] * len(dates), "source": ["test"] * len(dates)})
    rows = build_activity_series(cases)
    assert rows[0]["date"] == "2025-06-14"
    assert rows[0]["four_week_cases"] is None
    assert rows[3]["four_week_cases"] == 28.0
    assert rows[3]["four_week_average"] == 7.0
    assert rows[6]["weekly_growth_percent"] is None
    assert rows[7]["weekly_growth_percent"] == 0.0
    assert rows[12]["thirteen_week_average"] == 7.0
    assert rows[12]["momentum_percent"] == 0.0
    assert rows[11]["momentum_percent"] is None
    assert rows[64]["year_over_year_change_cases"] == 0.0
    assert rows[64]["year_over_year_percent"] == 0.0


def test_activity_history_does_not_turn_missing_source_weeks_into_zeroes() -> None:
    dates = pd.date_range("2026-07-05", periods=10 * 7, freq="D")
    cases = pd.DataFrame({"date": dates, "cases": [1.0] * len(dates), "source": ["test"] * len(dates)})
    cases.loc[cases["date"] == pd.Timestamp("2026-08-12"), "source"] = "no reported cases"
    rows = build_activity_series(cases)
    assert not any(row["date"] == "2026-08-15" for row in rows)
    assert next(row for row in rows if row["date"] == "2026-08-22")["four_week_cases"] is None
    assert next(row for row in rows if row["date"] == "2026-08-22")["weekly_growth_percent"] is None


def test_rolling_averages_keep_prior_month_and_year_history_before_display_filtering() -> None:
    dates = pd.date_range("2025-09-28", periods=20 * 7, freq="D")
    cases = pd.DataFrame({
        "date": dates,
        "cases": [1.0 if day.year == 2025 else 2.0 for day in dates],
        "source": ["test"] * len(dates),
    })

    # The UI filters these finished records to January 2026. Its first point
    # must still include December weeks in both rolling windows.
    january = [row for row in build_activity_series(cases) if row["year"] == 2026 and row["date"][5:7] == "01"]
    first = january[0]
    assert first["date"] == "2026-01-03"
    assert first["weekly_cases"] == 10.0
    assert first["four_week_average"] == 7.75
    assert first["thirteen_week_average"] == 7.23
    assert first["momentum_percent"] == 7.2


def test_original_weekly_counts_preserve_rolling_windows_across_new_year() -> None:
    dates = pd.date_range("2025-09-28", periods=20 * 7, freq="D")
    cases = pd.DataFrame({"date": dates, "cases": [1.0] * len(dates), "source": ["test"] * len(dates)})
    missing = cases["date"].between("2025-12-28", "2025-12-31")
    cases.loc[missing, ["cases", "source"]] = [0.0, "no reported cases"]
    reported = pd.DataFrame({
        "week_ending": pd.date_range("2025-10-04", periods=20, freq="7D"),
        "cases": [7] * 20,
    })

    assert not any(row["date"] == "2026-01-03" for row in build_activity_series(cases))
    first = next(row for row in build_activity_series(cases, reported) if row["date"] == "2026-01-03")
    assert first["weekly_cases"] == 7.0
    assert first["four_week_average"] == 7.0
    assert first["thirteen_week_average"] == 7.0
    assert first["momentum_percent"] == 0.0


def test_2022_momentum_uses_presumed_zero_history_before_first_reported_case() -> None:
    dates = pd.date_range("2022-01-01", "2022-06-18", freq="D")
    cases = pd.DataFrame({
        "date": dates,
        "cases": [1.0 if day == pd.Timestamp("2022-05-19") else 0.0 for day in dates],
        "source": ["test" if day >= pd.Timestamp("2022-05-19") else "no reported cases" for day in dates],
    })
    rows = build_activity_series(cases)
    first_visible = next(row for row in rows if row["date"] == "2022-05-21")
    assert first_visible["weekly_cases"] == 1.0
    assert first_visible["four_week_average"] == 0.25
    assert first_visible["thirteen_week_average"] == 0.08
    assert first_visible["momentum_percent"] == 225.0

    # A later absent reporting day must still break its rolling windows.
    cases.loc[cases["date"] == pd.Timestamp("2022-06-01"), "source"] = "no reported cases"
    rows_with_gap = build_activity_series(cases)
    assert not any(row["date"] == "2022-06-04" for row in rows_with_gap)
    assert next(row for row in rows_with_gap if row["date"] == "2022-06-11")["momentum_percent"] is None


def test_daily_rolling_growth_matches_saturday_weekly_growth() -> None:
    dates = pd.date_range("2024-01-01", periods=80, freq="D")
    cases = pd.DataFrame({"date": dates, "cases": [float(1 + day.dayofyear // 10) for day in dates], "source": ["daily"] * len(dates)})
    activity = build_activity_series(cases)
    growth = build_growth_series(cases, activity)
    lookup = {row["date"]: row for row in growth}
    weekly = {row["date"]: row for row in activity}
    for date, row in weekly.items():
        if row["weekly_growth_percent"] is not None:
            assert lookup[date]["weekly_growth_percent"] == row["weekly_growth_percent"]
    assert lookup["2024-03-19"]["frequency"] == "daily"
    assert lookup["2024-03-19"]["weekly_growth_percent"] is not None


def test_growth_switches_to_weekly_without_synthetic_daily_points() -> None:
    dates = pd.date_range("2024-11-01", "2025-02-01", freq="D")
    cases = pd.DataFrame({"date": dates, "cases": [1.0] * len(dates),
        "source": ["daily" if day.year == 2024 else "current weekly" for day in dates]})
    reported = pd.DataFrame({"week_ending": pd.date_range("2025-01-04", "2025-02-01", freq="7D"), "cases": [7] * 5})
    activity = build_activity_series(cases, reported)
    growth = build_growth_series(cases, activity, reported)
    assert next(row for row in growth if row["date"] == "2024-12-31")["frequency"] == "daily"
    assert not any(row["date"] == "2025-01-01" for row in growth)
    assert next(row for row in growth if row["date"] == "2025-01-04")["frequency"] == "weekly"
    assert next(row for row in growth if row["date"] == "2025-01-04")["weekly_growth_percent"] == 0.0


def test_missing_daily_day_withholds_full_56_day_growth_window() -> None:
    dates = pd.date_range("2024-01-01", periods=115, freq="D")
    cases = pd.DataFrame({"date": dates, "cases": [1.0] * len(dates), "source": ["daily"] * len(dates)})
    cases.loc[cases["date"] == pd.Timestamp("2024-02-15"), "source"] = "no reported cases"
    growth = {row["date"]: row for row in build_growth_series(cases, [])}
    assert growth["2024-03-01"]["weekly_growth_percent"] is None
    assert growth["2024-03-31"]["weekly_growth_percent"] is None
    assert growth["2024-04-11"]["weekly_growth_percent"] == 0.0


def test_2022_growth_uses_presumed_preoutbreak_zeroes_without_plotting_them() -> None:
    dates = pd.date_range("2022-01-01", "2022-05-21", freq="D")
    cases = pd.DataFrame({"date": dates,
        "cases": [1.0 if day >= pd.Timestamp("2022-05-19") else 0.0 for day in dates],
        "source": ["daily" if day >= pd.Timestamp("2022-05-19") else "no reported cases" for day in dates]})
    growth = build_growth_series(cases, build_activity_series(cases))
    assert growth[0]["date"] == "2022-05-19"
    assert growth[0]["weekly_growth_percent"] > 0
    assert growth[-1]["date"] == "2022-05-21"

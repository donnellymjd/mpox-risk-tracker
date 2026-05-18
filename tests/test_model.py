from __future__ import annotations

import pandas as pd

from mpox_tracker.model import (
    build_seasonal,
    clean_daily_cases,
    combine_cases,
    expand_weekly_cases,
    gaussian_rolling_mean,
)


def test_expand_weekly_cases_does_not_cross_year_boundary() -> None:
    frame = pd.DataFrame({"week_ending": ["2026-01-04"], "cases": [8]})

    expanded = expand_weekly_cases(frame, source_label="weekly")

    assert expanded["date"].min() == pd.Timestamp("2026-01-01")
    assert expanded["date"].max() == pd.Timestamp("2026-01-04")
    assert expanded["cases"].sum() == 8


def test_gaussian_rolling_mean_keeps_constant_series_constant() -> None:
    series = pd.Series([2.0] * 20)

    smoothed = gaussian_rolling_mean(series, window=7, std=2)

    assert smoothed.round(8).tolist() == [2.0] * 20


def test_combine_cases_prefers_current_weekly_from_current_year() -> None:
    daily_2022 = clean_daily_cases(
        pd.DataFrame({"diagnosis_date": ["2022-05-19"], "count": [1]}),
        date_column="diagnosis_date",
        case_column="count",
        source_label="2022",
    )
    historical = clean_daily_cases(
        pd.DataFrame(
            {"diagnosis_date": ["2024-12-31", "2025-01-01"], "cases": [2, 99]}
        ),
        date_column="diagnosis_date",
        case_column="cases",
        source_label="historical",
    )
    weekly = pd.DataFrame(
        {
            "date": pd.to_datetime(["2025-01-01", "2025-01-02"]),
            "cases": [1.5, 1.5],
            "source": ["weekly", "weekly"],
        }
    )

    combined = combine_cases(daily_2022, historical, weekly)
    lookup = combined.set_index("date")

    assert lookup.loc[pd.Timestamp("2024-12-31"), "cases"] == 2
    assert lookup.loc[pd.Timestamp("2025-01-01"), "cases"] == 1.5


def test_build_seasonal_omits_feb_29() -> None:
    cases = pd.DataFrame(
        {
            "date": pd.to_datetime(["2024-02-28", "2024-02-29", "2024-03-01"]),
            "cases": [1.0, 1.0, 1.0],
            "source": ["test", "test", "test"],
            "year": [2024, 2024, 2024],
        }
    )

    seasonal = build_seasonal(cases)

    assert "Feb 29" not in seasonal["month_day"].tolist()

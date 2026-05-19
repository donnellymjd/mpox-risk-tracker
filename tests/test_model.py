from __future__ import annotations

import pandas as pd

from mpox_tracker.model import (
    build_payload,
    build_seasonal,
    clean_daily_cases,
    combine_cases,
    expand_weekly_cases,
    gaussian_rolling_mean,
    _risk_band,
)
from mpox_tracker.styling import export_styling


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


def test_build_seasonal_uses_continuous_context_across_years() -> None:
    cases = pd.DataFrame(
        {
            "date": pd.to_datetime(["2024-12-31", "2025-01-01", "2025-01-02"]),
            "cases": [4.0, 4.0, 4.0],
            "source": ["test", "test", "test"],
            "year": [2024, 2025, 2025],
        }
    )

    seasonal = build_seasonal(cases)
    jan_1 = seasonal.loc[seasonal["date"] == pd.Timestamp("2025-01-01")].iloc[0]

    assert pd.notna(jan_1["risk_index"])


def test_build_seasonal_nulls_january_2024_risk_indicator() -> None:
    cases = pd.DataFrame(
        {
            "date": pd.date_range("2023-12-28", "2024-02-02", freq="D"),
            "cases": [1.0] * 37,
            "source": ["test"] * 37,
        }
    )
    cases["year"] = cases["date"].dt.year

    seasonal = build_seasonal(cases)
    january_2024 = seasonal[
        (seasonal["date"] >= "2024-01-01") & (seasonal["date"] < "2024-02-01")
    ]
    february_2024 = seasonal[seasonal["date"] == pd.Timestamp("2024-02-01")]

    assert january_2024["risk_index"].isna().all()
    assert pd.notna(february_2024.iloc[0]["risk_index"])


def test_risk_band_thresholds() -> None:
    assert _risk_band(-0.1) == "Very Low"
    assert _risk_band(0.1) == "Low"
    assert _risk_band(0.7) == "Moderate"
    assert _risk_band(1.2) == "Moderate-High"
    assert _risk_band(1.6) == "High"


def test_payload_exports_chart_styling_contract() -> None:
    cases = pd.DataFrame(
        {
            "date": pd.date_range("2026-05-18", periods=3, freq="D"),
            "cases": [1.0, 2.0, 3.0],
            "source": ["test"] * 3,
        }
    )
    cases["year"] = cases["date"].dt.year
    seasonal = build_seasonal(cases)

    payload = build_payload(cases, seasonal, sources=[])

    assert payload["styling"] == export_styling()
    assert payload["styling"]["version"] == 1
    assert payload["styling"]["yearColors"]["2026"] == "#d55e00"
    assert payload["styling"]["riskBands"][0] == {
        "label": "Very Low",
        "min": None,
        "max": 0.0,
        "color": "#e6f0f5",
        "textColor": "#1e4976",
    }
    assert payload["styling"]["riskBands"][1]["textColor"] == "#256d4a"
    assert payload["parameters"]["risk_bands"][0] == {
        "label": "Very Low",
        "min": None,
        "max": 0.0,
    }

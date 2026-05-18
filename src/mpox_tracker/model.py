"""Indicator calculations for the NYC mpox tracker."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
import json
import math

import numpy as np
import pandas as pd

from . import config
from .sources import SourceMetadata


@dataclass(frozen=True)
class BuildResult:
    cases: pd.DataFrame
    seasonal: pd.DataFrame
    payload: dict


def clean_daily_cases(
    frame: pd.DataFrame,
    *,
    date_column: str,
    case_column: str,
    source_label: str,
) -> pd.DataFrame:
    cases = frame[[date_column, case_column]].copy()
    cases.columns = ["date", "cases"]
    cases["date"] = pd.to_datetime(cases["date"]).dt.normalize()
    cases["cases"] = pd.to_numeric(cases["cases"], errors="coerce").fillna(0.0)
    cases["source"] = source_label
    return cases.sort_values("date")


def expand_weekly_cases(frame: pd.DataFrame, *, source_label: str) -> pd.DataFrame:
    """Convert weekly totals to a daily equivalent without crossing year boundaries."""

    weekly = frame[["week_ending", "cases"]].copy()
    weekly["week_ending"] = pd.to_datetime(weekly["week_ending"]).dt.normalize()
    weekly["cases"] = pd.to_numeric(weekly["cases"], errors="coerce").fillna(0.0)

    rows: list[dict[str, object]] = []
    for row in weekly.sort_values("week_ending").itertuples(index=False):
        end = row.week_ending
        start = max(end - pd.Timedelta(days=6), pd.Timestamp(year=end.year, month=1, day=1))
        dates = pd.date_range(start=start, end=end, freq="D")
        daily_equivalent = float(row.cases) / len(dates)
        rows.extend(
            {"date": date, "cases": daily_equivalent, "source": source_label}
            for date in dates
        )

    return pd.DataFrame(rows).sort_values("date")


def combine_cases(
    daily_2022: pd.DataFrame,
    historical_daily: pd.DataFrame,
    current_weekly: pd.DataFrame,
) -> pd.DataFrame:
    current_start_year = int(current_weekly["date"].dt.year.min())
    historical_cutoff = pd.Timestamp(year=current_start_year, month=1, day=1)

    frames = [
        daily_2022,
        historical_daily[historical_daily["date"] < historical_cutoff],
        current_weekly,
    ]
    combined = pd.concat(frames, ignore_index=True)
    combined = combined.groupby("date", as_index=False).agg(
        cases=("cases", "sum"),
        source=("source", lambda values: " + ".join(sorted(set(values)))),
    )

    date_index = pd.date_range(
        start=pd.Timestamp(year=2022, month=1, day=1),
        end=combined["date"].max(),
        freq="D",
    )
    combined = combined.set_index("date").reindex(date_index)
    combined.index.name = "date"
    combined["cases"] = combined["cases"].fillna(0.0)
    combined["source"] = combined["source"].fillna("no reported cases")
    combined["year"] = combined.index.year
    combined["date"] = combined.index
    return combined.reset_index(drop=True)


def gaussian_rolling_mean(
    values: pd.Series,
    *,
    window: int = config.SMOOTHING_WINDOW_DAYS,
    std: float = config.SMOOTHING_STD_DAYS,
) -> pd.Series:
    """Trailing Gaussian rolling mean without requiring scipy."""

    if window < 1:
        raise ValueError("window must be at least 1")

    raw = values.astype(float).to_numpy()
    offsets = np.arange(window) - (window - 1) / 2
    weights = np.exp(-0.5 * (offsets / std) ** 2)
    smoothed = np.full(len(raw), np.nan, dtype=float)

    for idx in range(len(raw)):
        start = max(0, idx - window + 1)
        sample = raw[start : idx + 1]
        sample_weights = weights[-len(sample) :]
        valid = ~np.isnan(sample)
        if valid.any():
            smoothed[idx] = np.average(sample[valid], weights=sample_weights[valid])

    return pd.Series(smoothed, index=values.index)


def _day_axis(date: pd.Timestamp) -> tuple[str, int] | None:
    if date.month == 2 and date.day == 29:
        return None
    anchor = pd.Timestamp(year=2001, month=date.month, day=date.day)
    return anchor.strftime("%b %d"), int(anchor.dayofyear)


def build_seasonal(cases: pd.DataFrame) -> pd.DataFrame:
    rows: list[pd.DataFrame] = []

    for year, year_frame in cases.groupby("year", sort=True):
        year_frame = year_frame.sort_values("date").copy()
        year_frame["smoothed_cases"] = gaussian_rolling_mean(year_frame["cases"])
        log_smoothed = gaussian_rolling_mean(np.log1p(year_frame["cases"]))
        year_frame["risk_index"] = (
            log_smoothed - log_smoothed.shift(1)
        ) / config.RISK_NORMALIZATION_FACTOR
        year_frame["cumulative_cases"] = year_frame["cases"].cumsum()
        year_frame["year"] = int(year)
        rows.append(year_frame)

    seasonal = pd.concat(rows, ignore_index=True)
    axis = seasonal["date"].apply(_day_axis)
    seasonal = seasonal[axis.notna()].copy()
    seasonal["month_day"] = [item[0] for item in axis[axis.notna()]]
    seasonal["day_index"] = [item[1] for item in axis[axis.notna()]]
    return seasonal


def _json_number(value: object) -> float | int | None:
    if value is None:
        return None
    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        if math.isnan(float(value)) or math.isinf(float(value)):
            return None
        return round(float(value), 4)
    return value  # type: ignore[return-value]


def _risk_band(value: float | None) -> str:
    if value is None:
        return "Unknown"
    if value >= 1:
        return "Elevated"
    if value >= 0:
        return "Moderate"
    return "Low"


def build_payload(
    cases: pd.DataFrame,
    seasonal: pd.DataFrame,
    sources: list[SourceMetadata],
) -> dict:
    current_year = int(cases["year"].max())
    latest_date = pd.Timestamp(cases["date"].max())
    current = seasonal[seasonal["year"] == current_year].sort_values("date")
    latest_current = current[current["date"] <= latest_date].dropna(subset=["risk_index"]).tail(1)

    latest_risk = None
    latest_smoothed = None
    latest_cumulative = None
    if not latest_current.empty:
        row = latest_current.iloc[0]
        latest_risk = _json_number(row["risk_index"])
        latest_smoothed = _json_number(row["smoothed_cases"])
        latest_cumulative = _json_number(row["cumulative_cases"])

    last_28_cases = cases[cases["date"] > latest_date - pd.Timedelta(days=28)]["cases"].sum()

    records = []
    for row in seasonal.sort_values(["year", "day_index"]).itertuples(index=False):
        records.append(
            {
                "date": row.date.strftime("%Y-%m-%d"),
                "year": int(row.year),
                "month_day": row.month_day,
                "day_index": int(row.day_index),
                "cases": _json_number(row.cases),
                "smoothed_cases": _json_number(row.smoothed_cases),
                "cumulative_cases": _json_number(row.cumulative_cases),
                "risk_index": _json_number(row.risk_index),
                "source": row.source,
            }
        )

    return {
        "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "latest_data_date": latest_date.strftime("%Y-%m-%d"),
        "current_year": current_year,
        "summary": {
            "risk_index": latest_risk,
            "risk_band": _risk_band(latest_risk if isinstance(latest_risk, float) else None),
            "smoothed_daily_cases": latest_smoothed,
            "cumulative_cases_current_year": latest_cumulative,
            "cases_last_28_days": round(float(last_28_cases), 1),
        },
        "parameters": {
            "smoothing_window_days": config.SMOOTHING_WINDOW_DAYS,
            "smoothing_std_days": config.SMOOTHING_STD_DAYS,
            "risk_normalization_factor": config.RISK_NORMALIZATION_FACTOR,
        },
        "sources": [source.to_dict() for source in sources],
        "series": records,
        "notes": [
            "This is an unofficial indicator derived from public NYC Health case data.",
            "Weekly case counts are distributed across the week ending date to create a daily-equivalent signal for smoothing.",
            "Feb. 29 is omitted from the comparison axis so years align by month and day.",
        ],
    }


def write_outputs(result: BuildResult, output_dir: Path) -> None:
    data_dir = output_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    (data_dir / "risk_data.json").write_text(
        json.dumps(result.payload, indent=2) + "\n",
        encoding="utf-8",
    )

    cases_csv = result.cases[["date", "cases", "source"]].copy()
    cases_csv["date"] = cases_csv["date"].dt.strftime("%Y-%m-%d")
    cases_csv.to_csv(data_dir / "cases.csv", index=False)

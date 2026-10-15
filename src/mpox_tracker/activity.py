"""Weekly case-activity history for comparable dashboard charts."""

from __future__ import annotations

import math

import pandas as pd


WEEKLY_GROWTH_WEEKS = 8


def weekly_growth_percent(counts: list[float]) -> float:
    """Eight-week log-linear slope, expressed as weekly percent change.

    log(1 + count) keeps zero-count reporting weeks in the fit. The
    pseudocount makes this descriptive rather than a literal case-rate model.
    """

    if len(counts) != WEEKLY_GROWTH_WEEKS or any(not math.isfinite(value) or value < 0 for value in counts):
        raise ValueError("Weekly growth needs eight finite, nonnegative weekly counts.")
    center = (WEEKLY_GROWTH_WEEKS - 1) / 2
    divisor = sum((index - center) ** 2 for index in range(WEEKLY_GROWTH_WEEKS))
    slope = sum((index - center) * math.log1p(value) for index, value in enumerate(counts)) / divisor
    return math.expm1(slope) * 100


def build_activity_series(cases: pd.DataFrame, weekly_cases: pd.DataFrame | None = None) -> list[dict[str, object]]:
    """Aggregate only complete, sourced weeks; leave unavailable comparisons null."""

    daily = cases[["date", "cases", "source"]].copy().set_index("date").sort_index()
    daily["sourced"] = daily["source"] != "no reported cases"
    # The 2022 daily series begins with the first reported diagnosis on May 19.
    # For this outbreak onset only, treat preceding 2022 days as zero-count
    # history so the four- and 13-week windows can start with the first cases.
    # Missing reporting dates after May 18 remain unavailable, not zeroes.
    presumed_zero_2022 = (
        (daily.index >= pd.Timestamp("2022-01-01"))
        & (daily.index <= pd.Timestamp("2022-05-18"))
        & (daily["source"] == "no reported cases")
    )
    daily.loc[presumed_zero_2022, "sourced"] = True
    weekly = daily.resample("W-SAT").agg(
        cases=("cases", "sum"),
        days=("cases", "size"),
        sourced_days=("sourced", "sum"),
    )
    if weekly_cases is not None and not weekly_cases.empty:
        # The weekly source has the complete count for weeks crossing New Year.
        # Daily equivalents can omit the prior-year days of those weeks, so
        # prefer the original reporting-week totals wherever available.
        reported = weekly_cases[["week_ending", "cases"]].copy()
        reported["week_ending"] = pd.to_datetime(reported["week_ending"], errors="raise").dt.normalize()
        reported["cases"] = pd.to_numeric(reported["cases"], errors="raise")
        reported = reported.set_index("week_ending").sort_index()
        if reported.index.has_duplicates or (reported["cases"] < 0).any() or reported["cases"].isna().any():
            raise ValueError("Weekly case activity contains invalid reporting weeks or counts.")
        weekly.loc[reported.index.min() : reported.index.max(), ["days", "sourced_days"]] = 0
        weekly.loc[reported.index, "cases"] = reported["cases"]
        weekly.loc[reported.index, ["days", "sourced_days"]] = 7
    valid = (weekly["days"] == 7) & (weekly["sourced_days"] == 7)
    four_complete = valid.rolling(4, min_periods=4).sum() == 4
    thirteen_complete = valid.rolling(13, min_periods=13).sum() == 13
    # Compute across the full source history before clients apply year/month
    # display filters; the first visible week may need preceding hidden weeks.
    four_week_cases = weekly["cases"].rolling(4, min_periods=4).sum().where(four_complete)
    thirteen_week_cases = weekly["cases"].rolling(13, min_periods=13).sum().where(thirteen_complete)
    four_week_average = four_week_cases / 4
    thirteen_week_average = thirteen_week_cases / 13
    eight_complete = valid.rolling(WEEKLY_GROWTH_WEEKS, min_periods=WEEKLY_GROWTH_WEEKS).sum() == WEEKLY_GROWTH_WEEKS
    weekly_growth = weekly["cases"].rolling(WEEKLY_GROWTH_WEEKS, min_periods=WEEKLY_GROWTH_WEEKS).apply(
        lambda window: weekly_growth_percent(window.tolist()), raw=False,
    ).where(eight_complete)
    momentum_percent = ((four_week_average / thirteen_week_average) - 1) * 100
    momentum_percent = momentum_percent.where(thirteen_week_average.ne(0), 0).where(thirteen_complete & four_complete)
    year_over_year = thirteen_week_cases - thirteen_week_cases.shift(52)
    previous_year_cases = thirteen_week_cases.shift(52)
    year_over_year_percent = (year_over_year / previous_year_cases) * 100
    year_over_year_percent = year_over_year_percent.where(previous_year_cases.ne(0))

    records: list[dict[str, object]] = []
    for date, week in weekly.iterrows():
        if not valid.loc[date] or (date.month == 2 and date.day == 29):
            continue
        axis_date = pd.Timestamp(year=2001, month=date.month, day=date.day)

        def number(value: float) -> float | None:
            return round(float(value), 1) if pd.notna(value) else None

        records.append({
            "date": date.strftime("%Y-%m-%d"),
            "year": int(date.year),
            "month_day": axis_date.strftime("%b %d"),
            "day_index": int(axis_date.dayofyear),
            "weekly_cases": number(week["cases"]),
            "four_week_cases": number(four_week_cases.loc[date]),
            "four_week_average": round(float(four_week_average.loc[date]), 2) if pd.notna(four_week_average.loc[date]) else None,
            "thirteen_week_average": round(float(thirteen_week_average.loc[date]), 2) if pd.notna(thirteen_week_average.loc[date]) else None,
            "momentum_percent": round(float(momentum_percent.loc[date]), 1) if pd.notna(momentum_percent.loc[date]) else None,
            "weekly_growth_percent": round(float(weekly_growth.loc[date]), 1) if pd.notna(weekly_growth.loc[date]) else None,
            "year_over_year_change_cases": number(year_over_year.loc[date]),
            "year_over_year_percent": round(float(year_over_year_percent.loc[date]), 1) if pd.notna(year_over_year_percent.loc[date]) else None,
        })
    return records


def build_growth_series(
    cases: pd.DataFrame,
    activity: list[dict[str, object]],
    weekly_cases: pd.DataFrame | None = None,
) -> list[dict[str, object]]:
    """Evaluate the same eight-week trend daily when observed days exist.

    Each daily point uses eight non-overlapping seven-day blocks. On a
    Saturday, these blocks match the weekly input to weekly_growth_percent.
    Synthetic days from a weekly source never create daily growth points.
    """

    daily = cases[["date", "cases", "source"]].copy()
    daily["date"] = pd.to_datetime(daily["date"], errors="raise").dt.normalize()
    if daily["date"].duplicated().any():
        raise ValueError("Daily growth source contains duplicate dates.")
    daily = daily.set_index("date").sort_index()
    daily = daily.reindex(pd.date_range(daily.index.min(), daily.index.max(), freq="D"))
    observed = daily["source"].notna() & daily["source"].ne("no reported cases") & ~daily["source"].str.contains("weekly", case=False, na=False)
    presumed_zero_2022 = (
        (daily.index >= pd.Timestamp("2022-01-01"))
        & (daily.index <= pd.Timestamp("2022-05-18"))
        & daily["source"].eq("no reported cases")
        & daily["cases"].eq(0)
    )
    valid = observed | presumed_zero_2022
    seven_day_cases = daily["cases"].where(valid).rolling(7, min_periods=7).sum()
    # The eight shifted seven-day sums partition the latest 56 days exactly.
    blocks = pd.concat([seven_day_cases.shift(7 * offset) for offset in range(7, -1, -1)], axis=1)
    complete = blocks.notna().all(axis=1)

    first_weekly_end = None
    if weekly_cases is not None and not weekly_cases.empty:
        first_weekly_end = pd.to_datetime(weekly_cases["week_ending"], errors="raise").min().normalize()

    records: list[dict[str, object]] = []
    for date in daily.index[observed]:
        if (first_weekly_end is not None and date >= first_weekly_end) or (date.month == 2 and date.day == 29):
            continue
        axis_date = pd.Timestamp(year=2001, month=date.month, day=date.day)
        rate = weekly_growth_percent(blocks.loc[date].tolist()) if complete.loc[date] else None
        records.append({
            "date": date.strftime("%Y-%m-%d"),
            "year": int(date.year),
            "month_day": axis_date.strftime("%b %d"),
            "day_index": int(axis_date.dayofyear),
            "weekly_cases": round(float(seven_day_cases.loc[date]), 1) if pd.notna(seven_day_cases.loc[date]) else None,
            "weekly_growth_percent": round(rate, 1) if rate is not None else None,
            "frequency": "daily",
        })

    if first_weekly_end is not None:
        records.extend({
            "date": row["date"],
            "year": row["year"],
            "month_day": row["month_day"],
            "day_index": row["day_index"],
            "weekly_cases": row["weekly_cases"],
            "weekly_growth_percent": row["weekly_growth_percent"],
            "frequency": "weekly",
        } for row in activity if pd.Timestamp(row["date"]) >= first_weekly_end)
    return sorted(records, key=lambda row: row["date"])

"""Build the static tracker data files."""

from __future__ import annotations

import argparse
from pathlib import Path

from .model import (
    BuildResult,
    build_payload,
    build_seasonal,
    clean_daily_cases,
    combine_cases,
    expand_weekly_cases,
    write_outputs,
)
from .sources import load_2022_daily, load_current_weekly, load_historical_daily


def build(output_dir: Path) -> BuildResult:
    daily_2022_raw, source_2022 = load_2022_daily()
    historical_daily_raw, source_historical = load_historical_daily()
    current_weekly_raw, source_current = load_current_weekly()

    daily_2022 = clean_daily_cases(
        daily_2022_raw,
        date_column="diagnosis_date",
        case_column="count",
        source_label="NYC Health 2022 daily",
    )
    historical_daily = clean_daily_cases(
        historical_daily_raw,
        date_column="diagnosis_date",
        case_column="cases",
        source_label="NYC Health historical daily",
    )
    current_weekly = expand_weekly_cases(
        current_weekly_raw,
        source_label="NYC Health current weekly",
    )

    cases = combine_cases(daily_2022, historical_daily, current_weekly)
    seasonal = build_seasonal(cases)
    payload = build_payload(cases, seasonal, [source_2022, source_historical, source_current])
    result = BuildResult(cases=cases, seasonal=seasonal, payload=payload)
    write_outputs(result, output_dir)
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build static NYC mpox risk tracker data")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("site"),
        help="Static site output directory",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = build(args.output)
    summary = result.payload["summary"]
    print(
        "Built mpox tracker through "
        f"{result.payload['latest_data_date']} "
        f"with {summary['risk_band']} risk "
        f"(index={summary['risk_index']})."
    )


if __name__ == "__main__":
    main()

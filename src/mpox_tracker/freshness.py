"""Check whether the published tracker is still refreshing with current cases."""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
import json
from urllib.request import Request, urlopen


PUBLIC_DATA_URL = "https://donnellymjd.github.io/mpox-risk-tracker/data/risk_data.json"


def _utc_datetime(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(UTC) if parsed.tzinfo else None


def check_freshness(payload: object, *, now: datetime) -> list[str]:
    """Return actionable reasons the published feed is not current."""

    if not isinstance(payload, dict):
        return ["Published tracker data is not a JSON object."]

    reasons = []
    generated = _utc_datetime(payload.get("generated_at"))
    if generated is None:
        reasons.append("The published build time is missing or invalid.")
    else:
        hours_old = (now - generated).total_seconds() / 3600
        if hours_old > 36 or hours_old < -1:
            reasons.append(f"The published build is {hours_old:.1f} hours old (allowed: -1 to 36).")

    stoplight = payload.get("case_stoplight")
    if not isinstance(stoplight, dict) or stoplight.get("version") != 3:
        reasons.append("The published case stoplight is missing or incompatible.")
        return reasons
    as_of = _utc_datetime(f"{stoplight.get('as_of')}T00:00:00Z")
    if as_of is None:
        reasons.append("The latest completed case week is missing or invalid.")
    else:
        age_days = (now.date() - as_of.date()).days
        if age_days > 14 or age_days < 0:
            reasons.append(f"The latest completed case week is {age_days} days old (allowed: 0 to 14).")
    if not isinstance(stoplight.get("rows"), list) or len(stoplight["rows"]) != 4:
        reasons.append("The published stoplight has no complete set of readings.")
    return reasons


def main() -> None:
    parser = argparse.ArgumentParser(description="Check the public mpox tracker feed for missed refreshes")
    parser.add_argument("--url", default=PUBLIC_DATA_URL)
    args = parser.parse_args()
    try:
        request = Request(args.url, headers={"User-Agent": "d2sci-mpox-freshness-check/1.0"})
        with urlopen(request, timeout=30) as response:
            payload = json.load(response)
        reasons = check_freshness(payload, now=datetime.now(UTC))
    except Exception as error:
        reasons = [f"The published tracker feed could not be loaded: {error}"]
    if reasons:
        for reason in reasons:
            print(f"ALERT: {reason}")
        raise SystemExit(1)
    print("Published tracker build and weekly stoplight are current.")


if __name__ == "__main__":
    main()

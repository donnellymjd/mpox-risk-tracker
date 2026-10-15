from __future__ import annotations

from datetime import UTC, datetime

from mpox_tracker.freshness import check_freshness


NOW = datetime(2026, 10, 15, 12, 47, tzinfo=UTC)


def current_payload() -> dict:
    return {
        "generated_at": "2026-10-15T10:30:00Z",
        "case_stoplight": {
            "version": 1,
            "as_of": "2026-10-03",
            "rows": [{}, {}, {}],
        },
    }


def test_current_published_feed_passes() -> None:
    assert check_freshness(current_payload(), now=NOW) == []


def test_old_deployment_and_old_case_week_alert() -> None:
    payload = current_payload()
    payload["generated_at"] = "2026-10-13T10:00:00Z"
    payload["case_stoplight"]["as_of"] = "2026-09-26"
    reasons = check_freshness(payload, now=NOW)
    assert any("published build" in reason for reason in reasons)
    assert any("completed case week" in reason for reason in reasons)


def test_missing_stoplight_alerts() -> None:
    payload = current_payload()
    del payload["case_stoplight"]
    assert any("missing or incompatible" in reason for reason in check_freshness(payload, now=NOW))

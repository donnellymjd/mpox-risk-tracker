from __future__ import annotations

from datetime import UTC, date, datetime

from mpox_tracker.freshness import check_freshness, latest_due_case_week


NOW = datetime(2026, 10, 15, 12, 47, tzinfo=UTC)


def current_payload() -> dict:
    return {
        "generated_at": "2026-10-15T10:30:00Z",
        "case_stoplight": {
            "version": 3,
            "as_of": "2026-10-03",
            "rows": [{}, {}, {}, {}],
        },
    }


def test_current_published_feed_passes() -> None:
    assert check_freshness(current_payload(), now=NOW) == []


def test_old_deployment_and_missed_monthly_release_alert() -> None:
    payload = current_payload()
    payload["generated_at"] = "2026-10-13T10:00:00Z"
    payload["case_stoplight"]["as_of"] = "2026-09-05"
    reasons = check_freshness(payload, now=NOW)
    assert any("published build" in reason for reason in reasons)
    assert any("monthly release" in reason for reason in reasons)


def test_weekly_bins_remain_current_between_monthly_publications() -> None:
    payload = current_payload()
    payload["generated_at"] = "2026-10-18T10:30:00Z"
    assert check_freshness(payload, now=datetime(2026, 10, 18, 12, 47, tzinfo=UTC)) == []
    assert latest_due_case_week(datetime(2026, 11, 14, 20, 59, tzinfo=UTC)) == date(2026, 10, 3)
    assert latest_due_case_week(datetime(2026, 11, 14, 21, 1, tzinfo=UTC)) == date(2026, 11, 7)
    payload["generated_at"] = "2026-11-15T10:30:00Z"
    assert any("monthly release" in reason for reason in check_freshness(payload, now=datetime(2026, 11, 15, 12, 47, tzinfo=UTC)))


def test_missing_stoplight_alerts() -> None:
    payload = current_payload()
    del payload["case_stoplight"]
    assert any("missing or incompatible" in reason for reason in check_freshness(payload, now=NOW))

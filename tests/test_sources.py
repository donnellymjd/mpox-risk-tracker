from __future__ import annotations

import pandas as pd
import pytest

from mpox_tracker import sources


def test_discovery_uses_reviewed_weekly_chart_even_if_another_matches(monkeypatch) -> None:
    monkeypatch.setattr(sources.config, "CURRENT_WEEKLY_CHART_ID", None)
    monkeypatch.setattr(sources, "fetch_text", lambda _url: 'https://datawrapper.dwcdn.net/other/1/ https://datawrapper.dwcdn.net/k45Nw/22/')
    requested = []

    def fetch(chart_id, **_kwargs):
        requested.append(chart_id)
        return pd.DataFrame({"week_ending": ["2026-10-03"], "cases": [1]}), None

    monkeypatch.setattr(sources, "fetch_datawrapper_dataset", fetch)
    assert sources.discover_current_weekly_chart_id() == "k45Nw"
    assert requested == ["k45Nw"]


def test_discovery_rejects_unreviewed_replacement(monkeypatch) -> None:
    monkeypatch.setattr(sources.config, "CURRENT_WEEKLY_CHART_ID", None)
    monkeypatch.setattr(sources, "fetch_text", lambda _url: 'https://datawrapper.dwcdn.net/other/1/')
    with pytest.raises(ValueError, match="review the replacement chart"):
        sources.discover_current_weekly_chart_id()

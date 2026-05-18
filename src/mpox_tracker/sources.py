"""Fetch and normalize public NYC mpox data sources."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from io import StringIO
import re
from typing import Iterable

import pandas as pd
import requests

from . import config


DATAWRAPPER_BASE = "https://datawrapper.dwcdn.net"
DATAWRAPPER_ID_RE = re.compile(r"datawrapper\.dwcdn\.net/([A-Za-z0-9]+)/")


@dataclass(frozen=True)
class SourceMetadata:
    """Small serializable record describing a fetched data source."""

    name: str
    url: str
    rows: int
    fetched_at: str
    version: str | None = None

    def to_dict(self) -> dict[str, str | int | None]:
        return asdict(self)


def _headers() -> dict[str, str]:
    return {"User-Agent": config.USER_AGENT}


def fetch_text(url: str) -> str:
    response = requests.get(url, headers=_headers(), timeout=30)
    response.raise_for_status()
    return response.text


def _now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def resolve_datawrapper_version(chart_id: str) -> str:
    """Resolve the latest public Datawrapper version from its redirect page."""

    html = fetch_text(f"{DATAWRAPPER_BASE}/{chart_id}/")
    match = re.search(rf"dwcdn\.net/{re.escape(chart_id)}/(\d+)/", html)
    if not match:
        raise ValueError(f"Could not resolve latest Datawrapper version for {chart_id}")
    return match.group(1)


def fetch_datawrapper_dataset(
    chart_id: str,
    *,
    name: str,
    required_columns: Iterable[str],
) -> tuple[pd.DataFrame, SourceMetadata]:
    version = resolve_datawrapper_version(chart_id)
    url = f"{DATAWRAPPER_BASE}/{chart_id}/{version}/dataset.csv"
    csv_text = fetch_text(url)
    frame = pd.read_csv(StringIO(csv_text))
    missing = set(required_columns).difference(frame.columns)
    if missing:
        raise ValueError(f"{name} is missing required columns: {sorted(missing)}")

    return frame, SourceMetadata(
        name=name,
        url=url,
        rows=len(frame),
        version=version,
        fetched_at=_now_iso(),
    )


def discover_current_weekly_chart_id(page_url: str = config.NYC_MPOX_PAGE_URL) -> str:
    """Find the current weekly Datawrapper chart embedded on NYC's mpox page."""

    if config.CURRENT_WEEKLY_CHART_ID:
        return config.CURRENT_WEEKLY_CHART_ID

    html = fetch_text(page_url)
    chart_ids = list(dict.fromkeys(DATAWRAPPER_ID_RE.findall(html)))
    for chart_id in chart_ids:
        try:
            frame, _metadata = fetch_datawrapper_dataset(
                chart_id,
                name="NYC current weekly mpox cases",
                required_columns=("week_ending", "cases"),
            )
        except Exception:
            continue
        if len(frame) > 0:
            return chart_id

    raise ValueError(f"No current weekly mpox Datawrapper chart found at {page_url}")


def load_2022_daily() -> tuple[pd.DataFrame, SourceMetadata]:
    frame = pd.read_csv(config.NYC_2022_DAILY_URL)
    missing = {"diagnosis_date", "count"}.difference(frame.columns)
    if missing:
        raise ValueError(f"NYC 2022 daily source is missing columns: {sorted(missing)}")

    return frame, SourceMetadata(
        name="NYC Health 2022 mpox daily cases",
        url=config.NYC_2022_DAILY_URL,
        rows=len(frame),
        fetched_at=_now_iso(),
    )


def load_historical_daily() -> tuple[pd.DataFrame, SourceMetadata]:
    return fetch_datawrapper_dataset(
        config.HISTORICAL_DAILY_CHART_ID,
        name="NYC Health historical daily mpox cases",
        required_columns=("diagnosis_date", "cases"),
    )


def load_current_weekly() -> tuple[pd.DataFrame, SourceMetadata]:
    chart_id = discover_current_weekly_chart_id()
    return fetch_datawrapper_dataset(
        chart_id,
        name="NYC Health current weekly mpox cases",
        required_columns=("week_ending", "cases"),
    )

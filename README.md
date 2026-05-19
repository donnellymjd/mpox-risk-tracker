# NYC Mpox Spread Risk Tracker

An unofficial public health analytics dashboard for monitoring mpox case momentum in New York City using public NYC Health data.

Live dashboard: https://donnellymjd.github.io/mpox-risk-tracker/

This project is intended for situational awareness, public communication, and reproducible data analysis. It is not clinical guidance, an individual risk calculator, a forecast, or an official NYC Health product.

## What the tracker measures

The tracker summarizes recent mpox case activity in NYC through four outputs:

- Reported cases: public case counts from NYC Health sources, normalized to a daily-equivalent series.
- Smoothed daily cases: a 14-day Gaussian-smoothed case signal used to reduce reporting noise.
- Cumulative cases: year-to-date cumulative cases for each calendar year.
- Spread risk index: a directional indicator of whether smoothed case activity is increasing or decreasing.

The spread risk index is the main headline signal. It is best read as a momentum indicator, not as an estimate of individual exposure risk, transmissibility, or health system burden.

## Data sources

The pipeline uses public NYC Health data sources:

- 2022 daily mpox cases: `https://raw.githubusercontent.com/nychealth/monkeypox-data/main/trends/cases-by-day.csv`
- Historical daily NYC Health Datawrapper chart: `5lUBv`
- Current NYC Health mpox page: `https://www.nyc.gov/site/doh/health/health-topics/mpox.page`
- Current weekly case chart: discovered from the NYC Health mpox page at build time, then resolved to the latest public Datawrapper CSV.

The build writes source metadata, row counts, fetch timestamps, and Datawrapper versions into `site/data/risk_data.json` so each published dashboard includes a record of what was used.

## Methodology

### 1. Ingest and standardize case data

The pipeline loads three data feeds:

1. 2022 daily cases, where each record is already a diagnosis date and count.
2. Historical daily cases, from a public NYC Health Datawrapper chart.
3. Current weekly cases, from the Datawrapper chart currently embedded on the NYC Health mpox page.

All inputs are converted to a common schema:

```text
date, cases, source
```

Dates are normalized to calendar days. Case counts are parsed as numeric values. Missing case values are treated as zero within fetched records.

### 2. Convert weekly reporting to daily equivalents

The current source reports weekly totals by `week_ending`. To combine this with daily historical data, each weekly total is distributed evenly across the days in that reporting week.

Example:

```text
week_ending = 2026-05-09
cases = 7
daily equivalent = 1 case per day from 2026-05-03 through 2026-05-09
```

At the start of a calendar year, the expansion does not cross into the prior year. For example, a week ending on January 4 is distributed across January 1 through January 4.

This daily-equivalent transformation preserves the weekly total while creating a continuous series suitable for smoothing and year-over-year charting.

### 3. Build a continuous daily series

The standardized sources are combined into one daily time series from January 1, 2022 through the latest available data date.

For overlapping periods, the pipeline uses:

- 2022 daily source for 2022.
- Historical daily source before the current weekly source's first year.
- Current weekly daily-equivalent source for the current reporting period.

Dates with no reported cases are filled with zero cases. This makes smoothing deterministic and avoids gaps in the charted series.

### 4. Smooth the case signal

The dashboard reports smoothed daily cases using a trailing Gaussian rolling mean:

```text
window = 14 days
standard deviation = 5 days
```

This reduces noise from irregular reporting while retaining short-term changes. The same Gaussian smoother is also applied to `log(1 + cases)` for the risk-index calculation.

The implementation does not require SciPy; it computes normalized Gaussian weights directly in `src/mpox_tracker/model.py`.

### 5. Compute the spread risk index

The spread risk index is based on the day-to-day change in smoothed log case activity:

```text
log_signal_t = gaussian_rolling_mean(log(1 + cases_t))
risk_index_t = (log_signal_t - log_signal_previous_day) / 0.04
```

The `log(1 + cases)` transform makes the indicator respond to proportional changes while still handling zero-count days. The `0.04` denominator is a scaling factor chosen to put the daily log-change signal onto a readable index scale.

Interpretation:

- Negative values mean smoothed case activity is declining.
- Values near zero mean the smoothed signal is roughly flat.
- Positive values mean smoothed case activity is increasing.
- Larger positive values indicate faster growth in the smoothed signal.

This is a descriptive momentum index. It is not an Rt estimate, incidence rate, forecast, probability of infection, or official risk classification.

### 6. Assign risk bands

The dashboard maps the numeric index to bands:

| Spread risk index | Band |
| --- | --- |
| `< 0` | Very Low |
| `0 to < 0.5` | Low |
| `0.5 to < 1.0` | Moderate |
| `1.0 to < 1.5` | Moderate-High |
| `>= 1.5` | High |

These thresholds are pragmatic display ranges for a public dashboard. They should be interpreted alongside the underlying case counts and source recency.

### 7. Align years for seasonal charts

For year-over-year charts, dates are aligned by month and day. February 29 is omitted so leap years and non-leap years share the same comparison axis.

The seasonal view is for visual comparison only. The spread risk index itself is computed on the continuous daily time series before this month-day alignment is applied.

### 8. Suppress January 2024 risk-index values

January 2024 risk-index values are intentionally published as `null`.

The source data do not show a single clearly erroneous record. However, the index is unusually sensitive during this low-count period, likely because small absolute changes around reporting transitions can create outsized movement after log transformation and smoothing. The dashboard therefore suppresses the January 2024 index conservatively while still showing the underlying case series.

## Practitioner interpretation

Use the tracker to answer questions such as:

- Is the smoothed NYC mpox case signal rising, falling, or flat?
- How does current case activity compare with the same calendar period in prior years?
- When was the dashboard last generated, and what was the latest source-data date?
- Are headline risk bands supported by visible changes in the case series?

Do not use the tracker to determine whether a specific person should seek vaccination, testing, treatment, or clinical care. For individual health decisions, use official public health guidance and clinical consultation.

## Known limitations

- Case counts depend on testing access, care-seeking behavior, diagnosis practices, and reporting operations.
- Weekly totals are distributed evenly across each week, so day-level values in the current period are daily equivalents rather than observed daily diagnoses.
- Low-count periods can make percentage or log-change indicators unstable.
- Reporting lags can make the most recent week incomplete or subject to revision.
- The risk bands are not calibrated to clinical outcomes, hospitalization risk, or transmission-model estimates.
- This is an unofficial analysis of public data and may differ from official NYC Health summaries.

## Outputs

The build process writes these public artifacts:

- `site/data/risk_data.json`: full dashboard payload, including series values, parameters, chart color styling, source metadata, and notes.
- `site/data/summary.json`: compact latest-status summary used by lightweight previews.
- `site/data/cases.csv`: standardized daily case series used by the dashboard.
- `site/index.html`: full interactive dashboard.
- `site/embed-card.html`: compact status card.

## Reproducibility

Local build:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev]"
pytest
mpox-tracker --output site
python -m http.server 8000 --directory site
```

Then open `http://localhost:8000`.

Scheduled build:

- GitHub Actions runs tests, rebuilds the data, and deploys the static dashboard.
- The scheduled workflow runs daily at `10:23 UTC`.
- The workflow can also be run manually from GitHub Actions.

## Project structure

```text
src/mpox_tracker/sources.py   Fetches NYC Health and Datawrapper sources
src/mpox_tracker/styling.py   Defines exported chart colors and styling contract
src/mpox_tracker/model.py     Standardizes data and computes the indicator
src/mpox_tracker/build.py     Command-line build entry point
site/                         Static dashboard files
tests/                        Unit tests for source transformation and indicator behavior
```

## Health information

The dashboard includes links to respected mpox health resources, including NYC Health, CDC, Callen-Lorde, GMHC, and other community-oriented public health sources.

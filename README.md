# NYC Mpox Spread Risk Tracker

An unofficial public health analytics dashboard for monitoring mpox case momentum in New York City using public NYC Health data.

Live dashboard: https://donnellymjd.github.io/mpox-risk-tracker/

This project is intended for situational awareness, public communication, and reproducible data analysis. It is not clinical guidance, an individual risk calculator, a forecast, or an official NYC Health product.

## What the tracker measures

The tracker summarizes recent mpox case activity in NYC through these outputs:

- Reported cases: observed daily counts where NYC Health publishes them and original completed-week totals where only weekly reporting is available.
- Smoothed daily-equivalent cases: a 14-day Gaussian-smoothed legacy display signal; current weekly counts are apportioned across days only for this and the cumulative view, not for the current stoplight or weekly trend charts.
- Cumulative cases: year-to-date cumulative cases for each calendar year.
- Weekly case growth trend: an eight-week log-linear estimate of weekly percentage change in reported case counts, recalculated daily where genuine daily reports exist and otherwise at completed reporting weeks.
- Observed-daily case growth index: a legacy historical field retained in the data feed for compatibility, but no longer shown as a separate dashboard section.
- Case activity stoplight: the growth pace plus three descriptive weekly-count comparisons for recent level, 4-week versus 13-week momentum, and the same period last year.

The weekly growth trend describes recent change, not overall case activity. A slowing trend can coexist with elevated case counts, and neither growth measure estimates individual exposure risk, transmissibility, or health system burden.
The stoplight is also descriptive: higher reported case counts are unfavorable, but its colors are not calibrated probabilities or personal medical risk categories.
The top summary shows the percentage of current stoplight indicators marked red, with the count and denominator. It is computed from the validated stoplight rows on each data pull; if the feed is unavailable or stale, the percentage is withheld rather than shown as zero.
Vaccination coverage and wastewater detections are not inputs to the tracker or its stoplight. In particular, missing wastewater samples are not interpreted as negative detections.

All charts carry their metric, selected years and months, and full latest source date inside the chart area for screenshots. Each chart also has an expandable table of the plotted values, available without hover to keyboard and touch users. The year and month controls apply to every chart. The default view selects the current and prior year, from January through the viewer's current calendar month; 2022 remains available through the year filter because its outbreak-scale counts otherwise compress recent-year trends.

## Weekly case activity stoplight

The build computes all four stoplight rows from the current NYC Health weekly case rows, before they are distributed into daily equivalents. The first row is the eight-week weekly case growth trend; the others show recent level, momentum, and year-earlier comparison. `risk_data.json` and `summary.json` both publish a version 3 `case_stoplight` object with the source URL, latest week, comparison week, four rows, and an explanation if the source is unavailable. Each row includes its color and value now, the color and value four weeks earlier, its threshold rule, and the date when its current color began. Clients should display the published fields rather than reimplementing the thresholds.

`risk_data.json` publishes `case_growth_series` for the hybrid growth chart and `case_activity_series` for the completed-week stoplight and other weekly charts. For genuine daily sources, the growth chart fits eight non-overlapping seven-day totals ending at each observed day; for the original NYC weekly source, it fits eight completed reported weeks. Each growth point identifies its source frequency. The weekly activity history also contains trailing four-week cases, four- and 13-week weekly averages, momentum percentage, and year-over-year percentage. Missing-source windows and comparisons without complete coverage are not plotted. A zero year-earlier total yields no percentage point on that chart; the table uses its documented count-based exception. Percentage comparisons after very small baselines may be volatile, so read them alongside the underlying counts.

A reporting week ending today or later is excluded because it may still be in progress. If the latest completed week is more than 14 days old, the stoplight rows are withheld; consumers also check age so an older published file cannot continue to display a current-looking color. The year-over-year rule treats a zero comparison baseline separately: one to four new cases are amber, and five or more are red.

The build expects the reviewed NYC Health Datawrapper chart ID `k45Nw` on the official mpox page and resolves its latest version automatically. If NYC replaces the chart, the build fails for source review instead of silently switching to another matching dataset. An intentional migration can use `MPOX_CURRENT_WEEKLY_CHART_ID` after the new chart is checked.

- Weekly growth trend: fit a straight line to `log(1 + seven-day cases)` over eight consecutive, non-overlapping seven-day blocks and convert its slope to a percent change per week. In daily-source years the window rolls forward one day at a time; in weekly-source years it advances one reporting week. Saturday-ending daily-source fits match the completed-week calculation. At most +5% is green, above +5% is amber, and above +15% is red only if the latest four-week total is at least 15 cases. The added one case stabilizes zero-count weeks, so this is a descriptive trend, not a literal incidence-rate estimate.
- Recent level: four-week total below 15 is green, 15–59 amber, and 60 or more red.
- Momentum: trailing four-week weekly average versus trailing 13-week weekly average; increases of 15% or less (and all declines) are green, increases above 15% through 40% amber, and increases above 40% red. A larger decline is favorable because higher case activity is unfavorable.
- Versus last year: trailing 13-week total versus the 13 weeks ending 52 weeks earlier; at least 20% lower is green, more than 20% higher red, otherwise amber.

These thresholds are pragmatic display rules, not validated public-health alert levels. The build withholds all four rows when weekly dates or counts are invalid, reporting weeks are missing or duplicated, or there is insufficient history for the four-weeks-ago year comparison.
The [retrospective weekly-growth check](docs/growth-backtest.md) compares six- and eight-week fits against the 2022 outbreak and quieter years. Growth and momentum are correlated views of the same case counts, so the share of indicators marked red is not a probability or a count of independent signals.

The weekly activity feed also contains weekly counts, four- and 13-week rolling averages, momentum percentage, and year-over-year percentage for the charts. Comparison charts shade the numeric thresholds; the weekly growth chart notes that red in the stoplight additionally requires 15 recent cases. The momentum components chart shows the most recent selected year and shares the page's month filter. Year-over-year percentages are omitted when the earlier total is zero; the table uses its separate zero-baseline count rule.
Rolling averages and comparisons are calculated on the full dated series before the year and month display filters are applied, so the first visible point can use preceding weeks outside the selected view.
For the 2022 outbreak onset, dates before the first NYC Health daily case on May 19 are treated as zero-case days in these rolling windows. This lets the 2022 momentum chart begin with the first visible reporting week rather than waiting until August for 13 post-onset weeks. Later missing-source dates are not treated as zeroes. Early percentage comparisons can be especially volatile because the longer-window average is close to zero.

## Data sources

The pipeline uses public NYC Health data sources:

- 2022 daily mpox cases: `https://raw.githubusercontent.com/nychealth/monkeypox-data/main/trends/cases-by-day.csv`
- Historical daily NYC Health Datawrapper chart: `5lUBv`
- Current NYC Health mpox page: `https://www.nyc.gov/site/doh/health/health-topics/mpox.page`
- Current weekly case chart: discovered from the NYC Health mpox page at build time, then resolved to the latest public Datawrapper CSV.

The build writes source metadata, row counts, fetch timestamps, and Datawrapper versions into `site/data/risk_data.json` so each published dashboard includes a record of what was used.

## Methodology

The headline signal and all four stoplight rows use **original completed reporting-week counts**, not estimated daily cases. The weekly growth chart also uses genuine daily case reports where available. The older smoothed daily-equivalent signal and observed-daily index remain in the feed for compatibility but do not determine the current stoplight. See [Weekly case activity stoplight](#weekly-case-activity-stoplight) for the exact color rules.

### 1. Ingest and standardize case data

The pipeline loads three data feeds:

1. 2022 daily cases, where each record is already a diagnosis date and count.
2. Historical daily cases, from a public NYC Health Datawrapper chart.
3. Current weekly cases, from the Datawrapper chart currently embedded on the NYC Health mpox page.

All inputs are converted to a common schema:

```text
date, cases, source
```

Dates are normalized to calendar days and case counts are parsed as numeric values. Missing case values are treated as zero within fetched daily records. Weekly stoplight inputs are separately validated; missing or invalid reporting weeks are not silently replaced with zero.

### 2. Validate completed reporting weeks and calculate current signals

The four current stoplight rows are calculated from NYC Health's original weekly totals. A week ending today or later is excluded because it may still be in progress. Missing or duplicated weeks, invalid counts, insufficient history, or a latest completed week more than 14 days old make the stoplight unavailable rather than green or zero. The year-earlier comparison needs 13 complete weeks in both periods, including at the four-weeks-ago reference date.

Weekly growth fits a straight line to `log(1 + cases)` across eight consecutive weekly totals, then converts the fitted slope to percentage change per week with `100 × (exp(slope) − 1)`. The `+1` allows zero-count weeks but makes this a descriptive trend, not a literal incidence growth rate. The first row's red color also requires at least 15 cases in the latest four complete weeks. Recent level uses that four-week case total. Momentum compares the four-week and 13-week **weekly averages**; a higher four-week average is unfavorable. The year-earlier row compares the latest 13-week total with the 13 weeks ending 52 weeks before it. The top “Indicators red” share is the number of red rows divided by four only when all four rows are valid.

The growth chart adds daily-frequency points only where genuine daily case data are available: each point refits the same trend to eight non-overlapping seven-day totals ending on that day. Once the source becomes weekly-only, points occur only at completed week endings. Synthetic daily equivalents never create daily growth points. All weekly rolling averages and comparisons are computed on the full sourced history **before** the year and month display filters, so the first visible point can use earlier weeks. After the first reported 2022 case, missing source dates invalidate affected windows; only the pre-onset period through May 18, 2022 is assumed to contain zero cases.

### 3. Convert weekly reporting to daily equivalents for legacy displays

The current source reports weekly totals by `week_ending`. To combine this with daily historical data, each weekly total is distributed evenly across the days in that reporting week.

Example:

```text
week_ending = 2026-05-09
cases = 7
daily equivalent = 1 case per day from 2026-05-03 through 2026-05-09
```

At the start of a calendar year, the expansion does not cross into the prior year. For example, a week ending on January 4 is distributed across January 1 through January 4.

This daily-equivalent transformation preserves the weekly total while creating a continuous series for smoothing and the calendar-year cumulative chart. It is **not** used to calculate the current stoplight, weekly growth, recent case level, momentum, or year-over-year percentage chart.

### 4. Build a continuous daily series for legacy displays

The standardized sources are combined into one daily time series from January 1, 2022 through the latest available data date.

For overlapping periods, the pipeline uses:

- 2022 daily source for 2022.
- Historical daily source before the current weekly source's first year.
- Current weekly daily-equivalent source for the current reporting period.

Dates with no reported cases are filled with zero in this display series. That fill does not turn missing-source weeks into observed zero-case weeks for the current signals.

### 5. Smooth the legacy daily-equivalent case signal

The dashboard reports smoothed daily cases using a trailing Gaussian rolling mean:

```text
window = 14 days
standard deviation = 5 days
```

This reduces noise from irregular reporting while retaining short-term changes. The same Gaussian smoother is also applied to `log(1 + cases)` for the legacy risk-index calculation. Neither smoothing step sets a current stoplight color.

The implementation does not require SciPy; it computes normalized Gaussian weights directly in `src/mpox_tracker/model.py`.

### 6. Compute the historical observed-daily growth index

The separate historical daily index is based on the day-to-day change in smoothed log case activity:

```text
log_signal_t = gaussian_rolling_mean(log(1 + cases_t))
risk_index_t = (log_signal_t - log_signal_previous_day) / 0.04
```

The `log(1 + cases)` transform makes the indicator respond to proportional changes while still handling zero-count days. The `0.04` denominator is a scaling factor chosen to put the daily log-change signal onto a readable index scale.

Interpretation:

- Negative values mean smoothed case activity is declining.
- Values near zero mean the smoothed signal is roughly flat.
- Positive values mean smoothed case activity is increasing.
- Larger positive values indicate faster growth in the smoothed signal, not higher overall case activity by themselves.

This series requires a complete 14-day window of observed daily-source records and is suppressed in weekly-only reporting years. It is not used for the current stoplight. Neither it nor the weekly growth trend is an Rt estimate, incidence rate, forecast, probability of infection, or official risk classification.

### 7. Assign historical daily-index bands

The data feed retains these legacy bands for compatibility; the dashboard no longer displays the separate daily-index section:

| Case growth index | Band |
| --- | --- |
| `< 0` | Very Low |
| `0 to < 0.5` | Low |
| `0.5 to < 1.0` | Moderate |
| `1.0 to < 1.5` | Moderate-High |
| `>= 1.5` | High |

These thresholds are pragmatic historical display ranges, not validated public-health alert levels.

### 8. Align years for seasonal charts

For year-over-year charts, dates are aligned by month and day. February 29 is omitted so leap years and non-leap years share the same comparison axis.

The seasonal view is for visual comparison only. The historical observed-daily index is computed on the continuous daily time series before this month-day alignment is applied. Hover labels retain each observation's actual ending date, rather than implying that different years share an identical week ending.

### 9. Suppress January 2024 risk-index values

January 2024 risk-index values are intentionally published as `null`.

The source data do not show a single clearly erroneous record. However, the index is unusually sensitive during this low-count period, likely because small absolute changes around reporting transitions can create outsized movement after log transformation and smoothing. The data feed therefore suppresses the January 2024 index conservatively while retaining the underlying case series.

## Practitioner interpretation

Use the tracker to answer questions such as:

- Is the smoothed NYC mpox case signal rising, falling, or flat?
- How does current case activity compare with the same calendar period in prior years?
- When was the dashboard last generated, and what was the latest source-data date?
- Do the four descriptive stoplight rows agree with the underlying weekly counts and their recent direction?

Do not use the tracker to determine whether a specific person should seek vaccination, testing, treatment, or clinical care. For individual health decisions, use official public health guidance and clinical consultation.

## Known limitations

- Case counts depend on testing access, care-seeking behavior, diagnosis practices, and reporting operations.
- Weekly totals are distributed evenly across each week, so day-level values in the current period are daily equivalents rather than observed daily diagnoses.
- Low-count periods can make percentage or log-change indicators unstable.
- Reporting lags can make the most recent week incomplete or subject to revision.
- No wastewater or vaccination coverage data are included. A wastewater reporting gap must not be interpreted as an absence of mpox circulation.
- The risk bands are not calibrated to clinical outcomes, hospitalization risk, or transmission-model estimates.
- This is an unofficial analysis of public data and may differ from official NYC Health summaries.

## Outputs

The build process writes these public artifacts:

- `site/data/risk_data.json`: full dashboard payload, including series values, parameters, the case stoplight, chart color styling, source metadata, and notes.
- `site/data/summary.json`: compact latest-status summary, including the case stoplight, used by lightweight previews.
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
- A separate watchdog checks the published JSON daily at `12:47 UTC`. It opens one GitHub issue assigned to `donnellymjd` if the published build is more than 36 hours old, the completed case week is over 14 days old, or the stoplight is missing; it closes the issue after recovery. Watchdog runs and issue notifications depend on GitHub Actions and repository notification settings, so this is not an out-of-band paging service.

## Project structure

```text
src/mpox_tracker/sources.py   Fetches NYC Health and Datawrapper sources
src/mpox_tracker/styling.py   Defines exported chart colors and styling contract
src/mpox_tracker/model.py     Standardizes data and computes the indicator
src/mpox_tracker/stoplight.py Computes weekly case activity stoplights
src/mpox_tracker/freshness.py Checks published feed freshness for the watchdog
src/mpox_tracker/build.py     Command-line build entry point
site/                         Static dashboard files
tests/                        Unit tests for source transformation and indicator behavior
```

## Health information

The dashboard includes links to respected mpox health resources, including NYC Health, CDC, Callen-Lorde, GMHC, and other community-oriented public health sources.

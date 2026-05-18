# NYC Mpox Spread Risk Tracker

Static dashboard and scheduled data pipeline for an unofficial NYC mpox spread risk indicator.

## Recommendation

Keep `d2sci.co` on Figma Sites and host the tracker as a separate static app on GitHub Pages, then link or embed it from the Figma site. Figma Sites supports embeds, external webpages, and custom code elements, but it is not the right place to run a recurring Python notebook. GitHub Actions can run the Python data job on a schedule and GitHub Pages can serve the generated static files.

Recommended URL pattern:

- `https://donnellymjd.github.io/mpox-risk-tracker/` for the default Pages URL.
- Optional: `https://mpox.d2sci.co/` as a custom GitHub Pages subdomain.
- In Figma Sites, add the Pages URL as a webpage/embed block or iframe-style custom code.

## What This Replaces

The original Colab notebook mixed data discovery, source fetching, transformation, and plotting in one runtime. This repo separates those concerns:

- `src/mpox_tracker/sources.py` fetches public NYC Health sources.
- `src/mpox_tracker/model.py` standardizes case data and computes the risk indicator.
- `site/` contains a static dashboard that reads `site/data/risk_data.json`.
- `.github/workflows/update-and-deploy.yml` runs tests, rebuilds data, and deploys to GitHub Pages daily.
- The dashboard includes a resource section linking to queer-positive and public health mpox information.

## Data Sources

- NYC Health 2022 daily case repository: `https://raw.githubusercontent.com/nychealth/monkeypox-data/main/trends/cases-by-day.csv`
- NYC Health historical daily Datawrapper chart: `5lUBv`
- NYC Health current mpox page: `https://www.nyc.gov/site/doh/health/health-topics/mpox.page`
- Current weekly chart discovery: the build script finds the Datawrapper chart embedded on the NYC page and resolves its latest public CSV version.

## Indicator

The tracker:

1. Loads daily 2022 cases, historical daily cases for later baseline years, and the current weekly case chart.
2. Converts weekly case totals into daily-equivalent values across the reporting week.
3. Smooths the continuous daily-equivalent case series with a 14-day Gaussian window.
4. Computes the day-to-day change in smoothed log cases on the continuous series.
5. Normalizes that change by `0.04` to produce the spread risk index.
6. Aligns years by month and day for charting.

January 2024 risk-index values are published as `null`. The source data do not show a single bad record, but the indicator is unusually sensitive in that low-count period, so the display suppresses that month conservatively.

Bands:

- `< 0`: Very Low
- `0 to < 0.5`: Low
- `0.5 to < 1.0`: Moderate
- `1.0 to < 1.5`: Moderate-High
- `>= 1.5`: High

This is for situational awareness and should not be treated as clinical or individual medical guidance.

## Local Development

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev]"
pytest
mpox-tracker --output site
python -m http.server 8000 --directory site
```

Then open `http://localhost:8000`.

## Deployment

After pushing to GitHub:

1. In the repository settings, enable GitHub Pages with GitHub Actions as the source.
2. Run the `Update and deploy tracker` workflow manually once.
3. Add the resulting Pages URL to Figma Sites as an embed or link.

The workflow also runs every day at `10:23 UTC`.

## Optional Custom Subdomain

To serve this from `mpox.d2sci.co`, configure GitHub Pages for that custom domain and add the DNS record requested by GitHub. Keep the apex `d2sci.co` pointed at Figma Sites.

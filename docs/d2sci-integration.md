# D2Sci Site Integration

The tracker is designed to live as a separate static app while visually matching `d2sci.co`.

## Recommended Placement

- Main site: keep `https://www.d2sci.co/` on Figma Sites.
- Tracker app: keep GitHub Pages at `https://donnellymjd.github.io/mpox-risk-tracker/`.
- Optional custom domain: use `https://mpox.d2sci.co/` after adding DNS and configuring GitHub Pages.

## Figma Sites Preview Card

Use one of these options in Figma Sites:

- Link card: point a card or button to `https://donnellymjd.github.io/mpox-risk-tracker/`.
- Embedded preview: embed `https://donnellymjd.github.io/mpox-risk-tracker/embed-card.html`.
- Custom code: fetch `https://donnellymjd.github.io/mpox-risk-tracker/data/summary.json` and render the latest weekly growth label/date inside a D2Sci card.

The D2Sci mpox page fetches `risk_data.json` for its charts and case activity stoplight. The version 3 stoplight is computed during this repository's data build from completed NYC Health weekly counts. NYC publishes the weekly bins monthly, on the second Thursday at 4 p.m. Eastern; the latest published week can normally be several weeks old. Its first row is the eight-week weekly growth trend, followed by recent level, momentum, and year-earlier comparison. D2Sci should render `case_stoplight.rows` and its dates, rules, and source URL as published, without duplicating the thresholds in browser code. It continues to accept older versions during deployment: version 1 has three rows; version 2 has a daily-growth first row and must not be labeled as weekly growth. If `case_stoplight.rows` is empty, malformed, or the field has not yet been deployed, show an unavailable message rather than a cached color. Withhold the rows if the published feed itself is more than 36 hours old; do not reject a monthly source solely because its last week ended more than 14 days ago.

The same feed includes `case_growth_series` for the hybrid-frequency growth chart: eight non-overlapping seven-day totals ending at every genuine daily-source date, then completed reported weeks where only weekly totals exist. Each row has `frequency: daily|weekly`; label the plotted years accordingly and show actual ending dates in hover text. The completed-week `case_activity_series` remains the source for the stoplight and the other weekly trend charts: trailing four-week cases, momentum percentage (four-week versus 13-week weekly averages), and percentage change in trailing 13-week cases versus 52 weeks earlier. It also includes the weekly counts and both rolling averages for a decomposed momentum chart above the percentage chart. The historical `series.risk_index` remains in the feed for compatibility but no longer has a separate chart section. Shade each displayed trend chart using its numeric thresholds; the weekly growth stoplight additionally requires 15 cases in four weeks for red. The shared year and month controls apply to all charts, with the current and prior years selected by default; the momentum components use the most recent selected year. The top growth summary uses `summary.weekly_growth_label` and `summary.weekly_growth_percent`. Year-over-year percentages are null for a zero earlier total, while the table uses a separate count-based rule.

The top summary's “Indicators red” percentage is the number of current red stoplight rows divided by all validated current stoplight rows. Display the numerator and denominator, and show unavailable when the stoplight feed is stale or invalid; do not substitute zero.

The full tracker should open as its own page rather than live inside a tall iframe. That keeps chart hover states, scrolling, and health-resource links clean.

## Brand Notes

The tracker uses the D2Sci public site palette:

- Navy: `#1E4976`
- Blue: `#2C5F94`
- Orange: `#E8833A`
- Light gray: `#F7FAFC`

Risk-band shading remains semantically colored inside the chart, but the navigation, text, controls, cards, and links use the D2Sci palette.

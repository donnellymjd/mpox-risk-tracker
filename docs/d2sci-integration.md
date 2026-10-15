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
- Custom code: fetch `https://donnellymjd.github.io/mpox-risk-tracker/data/summary.json` and render the latest risk band/date inside a D2Sci card.

The D2Sci mpox page fetches `risk_data.json` for its charts and case activity stoplight. The stoplight is computed during this repository's data build from the raw NYC Health weekly counts. D2Sci should render `case_stoplight.rows` and its dates, rules, and source URL as published, without duplicating the thresholds in browser code. If `case_stoplight.rows` is empty, malformed, more than 14 days old, or the field has not yet been deployed, show an unavailable message rather than a cached color.

The full tracker should open as its own page rather than live inside a tall iframe. That keeps chart hover states, scrolling, and health-resource links clean.

## Brand Notes

The tracker uses the D2Sci public site palette:

- Navy: `#1E4976`
- Blue: `#2C5F94`
- Orange: `#E8833A`
- Light gray: `#F7FAFC`

Risk-band shading remains semantically colored inside the chart, but the navigation, text, controls, cards, and links use the D2Sci palette.

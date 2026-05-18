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

The full tracker should open as its own page rather than live inside a tall iframe. That keeps chart hover states, scrolling, and health-resource links clean.

## Brand Notes

The tracker uses the D2Sci public site palette:

- Navy: `#1E4976`
- Blue: `#2C5F94`
- Orange: `#E8833A`
- Light gray: `#F7FAFC`

Risk-band shading remains semantically colored inside the chart, but the navigation, text, controls, cards, and links use the D2Sci palette.

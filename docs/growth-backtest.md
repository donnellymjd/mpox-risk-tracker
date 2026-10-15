# Weekly growth trend: retrospective check

Data build through October 3, 2026. These are descriptive checks against the available NYC Health case history, not estimates of sensitivity, specificity, transmission, or clinical risk.

The candidate fits a straight line to `log(1 + weekly cases)` over the latest eight complete Saturday-ending reporting weeks. `expm1(slope) × 100` gives an estimated percentage change per week. A missing reporting week withholds the point. The added one case permits zero-count weeks but makes the result an index-like growth estimate rather than a literal relative change in observed counts. The stoplight is green at +5% or below, amber above +5%, and red above +15% only when the latest four weeks contain at least 15 reported cases. The case floor reduces dramatic red readings caused by small-number changes such as one to two cases.

| Period | Eight-week red weeks | First red, where applicable |
| --- | ---: | --- |
| 2022 | 11 | June 11, 2022 |
| 2023 | 2 | October 21, 2023 |
| 2024 | 1 | February 3, 2024 |
| 2025 | 4 | May 3, 2025 |
| 2026 through October 3 | 3 | September 19, 2026 |

For comparison, a six-week fit at the same +15% cutoff and 15-case floor yielded 9, 3, 8, 3, and 4 red weeks in those years, respectively. The eight-week fit was less reactive to short fluctuations in the quieter years while still detecting the rapid 2022 ascent. Its latest estimate is +24.6% per week, compared with +14.3% for the six-week fit. The 2022 calculation assumes zero cases before the first reported daily case on May 19; that assumption should be kept visible when interpreting the early curve.

These thresholds are pragmatic dashboard rules, not validated public-health alert levels. The growth trend and four-versus-13-week momentum share weekly case counts and are correlated; the dashboard's “percent red” should not be interpreted as a probability or as four independent pieces of evidence. Data revisions, reporting delays, and low counts can change historical and latest readings.

The hybrid-frequency chart uses exactly the same eight-block estimator at observed daily dates, shifting its 56-day window one day at a time. In the October 3, 2026 build it has 957 daily-source points (2022–2024) and 92 weekly-source points (2025–2026). All 137 daily-source points falling on a comparable completed-week ending match the weekly growth history to one decimal place. This supports retaining the existing percentage thresholds, but adjacent daily points overlap heavily and must not be treated as independent alerts. The stoplight itself remains on completed reporting weeks.

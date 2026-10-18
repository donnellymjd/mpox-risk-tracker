import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  Legend,
} from "recharts";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Card, CardContent } from "./ui/card";
import {
  Activity,
  History,
  RefreshCw,
  ExternalLink,
  Github,
  AlertCircle,
  Info,
} from "lucide-react";

const TRACKER_URL = "https://donnellymjd.github.io/mpox-risk-tracker/";
const DATA_URL =
  "https://donnellymjd.github.io/mpox-risk-tracker/data/risk_data.json";
const REPO_URL = "https://github.com/donnellymjd/mpox-risk-tracker";

interface BandStyle {
  bg: string;
  text: string;
}

interface Styling {
  yearColors: Record<string, string>;
  riskBands: StyledRiskBand[];
  bandStyles: Record<string, BandStyle>;
}

const FALLBACK_YEAR_COLOR = "#2f665f";
const FALLBACK_BAND_BG = "#e5e7eb";
const FALLBACK_BAND_TEXT = "#475569";

const DEFAULT_STYLING: Styling = {
  yearColors: {
    "2022": "#1e4976",
    "2023": "#e8833a",
    "2024": "#009e73",
    "2025": "#6f4aa0",
    "2026": "#d55e00",
    "2027": "#0072b2",
  },
  riskBands: [
    { label: "Very Low", min: null, max: 0.0, color: "#e6f0f5", textColor: "#1e4976" },
    { label: "Low", min: 0.0, max: 0.5, color: "#d8e8df", textColor: "#256d4a" },
    { label: "Moderate", min: 0.5, max: 1.0, color: "#fff0bf", textColor: "#8a6300" },
    { label: "Moderate-High", min: 1.0, max: 1.5, color: "#fbd1a7", textColor: "#a04a14" },
    { label: "High", min: 1.5, max: null, color: "#f3b7b2", textColor: "#9a2f29" },
  ],
  bandStyles: {
    "Very Low":      { bg: "#e6f0f5", text: "#1e4976" },
    "Low":           { bg: "#d8e8df", text: "#256d4a" },
    "Moderate":      { bg: "#fff0bf", text: "#8a6300" },
    "Moderate-High": { bg: "#fbd1a7", text: "#a04a14" },
    "High":          { bg: "#f3b7b2", text: "#9a2f29" },
  },
};

const YEAR_LINE_PATTERNS = [
  { dash: undefined, label: "solid" },
  { dash: "10 4", label: "long dash" },
  { dash: "4 3", label: "short dash" },
  { dash: "10 3 2 3", label: "dash-dot" },
  { dash: "2 3", label: "dotted" },
  { dash: "14 3 3 3", label: "long-short dash" },
];

function linePatternForYear(year: number) {
  const index = ((year - 2022) % YEAR_LINE_PATTERNS.length + YEAR_LINE_PATTERNS.length) % YEAR_LINE_PATTERNS.length;
  return YEAR_LINE_PATTERNS[index];
}

interface StylingPayload {
  yearColors?: Record<string, string>;
  riskBands?: Array<{
    label: string;
    min?: number | null;
    max?: number | null;
    color?: string;
    textColor?: string;
  }>;
  version?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function defaultBandFor(label: string) {
  return DEFAULT_STYLING.riskBands.find((band) => band.label === label);
}

function mergeStyling(payload: StylingPayload | undefined): Styling {
  if (!payload) {
    console.warn("risk_data.json is missing styling; using built-in chart defaults.");
    return DEFAULT_STYLING;
  }
  if (
    !isPlainObject(payload) ||
    !isPlainObject(payload.yearColors) ||
    !Array.isArray(payload.riskBands) ||
    payload.riskBands.length === 0
  ) {
    console.warn("risk_data.json styling is malformed; using built-in chart defaults.");
    return DEFAULT_STYLING;
  }

  const yearColors: Record<string, string> = {};
  for (const [year, color] of Object.entries(payload.yearColors)) {
    if (!/^\d{4}$/.test(year) || !isHexColor(color)) {
      console.warn("risk_data.json styling is malformed; using built-in chart defaults.");
      return DEFAULT_STYLING;
    }
    yearColors[year] = color;
  }
  if (Object.keys(yearColors).length === 0) {
    console.warn("risk_data.json styling is malformed; using built-in chart defaults.");
    return DEFAULT_STYLING;
  }

  const riskBands = payload.riskBands.map((b) => {
    if (
      !isPlainObject(b) ||
      typeof b.label !== "string" ||
      !("min" in b) ||
      !("max" in b) ||
      !isNullableNumber(b.min) ||
      !isNullableNumber(b.max) ||
      !isHexColor(b.color)
    ) {
      return null;
    }
    const fallback = defaultBandFor(b.label);
    const textColor = "textColor" in b ? b.textColor : fallback?.textColor;
    if (!isHexColor(textColor)) return null;
    return {
      label: b.label,
      min: b.min,
      max: b.max,
      color: b.color,
      textColor,
    };
  });

  if (riskBands.some((band) => band === null)) {
    console.warn("risk_data.json styling is malformed; using built-in chart defaults.");
    return DEFAULT_STYLING;
  }

  const bandStyles: Record<string, BandStyle> = {};
  for (const band of riskBands as StyledRiskBand[]) {
    bandStyles[band.label] = { bg: band.color, text: band.textColor };
  }
  return { yearColors, riskBands: riskBands as StyledRiskBand[], bandStyles };
}

interface SeriesRow {
  date: string;
  year: number;
  month_day: string;
  day_index: number;
  cases: number | null;
  smoothed_cases: number | null;
  cumulative_cases: number | null;
  risk_index: number | null;
  source?: string;
}

interface ChartPoint {
  date: string;
  year: number;
  month_day: string;
  day_index: number;
  cases?: number | null;
  weekly_cases?: number | null;
  risk_index?: number | null;
  cumulative_cases?: number | null;
  four_week_cases?: number | null;
  four_week_average?: number | null;
  thirteen_week_average?: number | null;
  momentum_percent?: number | null;
  weekly_growth_percent?: number | null;
  year_over_year_percent?: number | null;
  frequency?: "daily" | "weekly";
}

type ChartField = "risk_index" | "cumulative_cases" | "four_week_cases" | "weekly_growth_percent" | "momentum_percent" | "year_over_year_percent";

interface RiskBand {
  label: string;
  min: number | null;
  max: number | null;
}

type StyledRiskBand = RiskBand & { color: string; textColor: string };

interface SourceRef {
  name: string;
  url: string;
  rows: number;
  fetched_at: string;
  version: string | null;
}

interface TrackerData {
  generated_at: string;
  latest_data_date: string;
  current_year: number;
  summary: {
    risk_index: number | null;
    risk_band: string | null;
    weekly_growth_percent: number | null;
    weekly_growth_color: "green" | "amber" | "red" | null;
    weekly_growth_label: string | null;
    smoothed_daily_cases: number | null;
    cumulative_cases_current_year: number | null;
    cases_last_28_days: number | null;
  };
  parameters: {
    smoothing_window_days: number;
    smoothing_std_days: number;
    risk_normalization_factor: number;
    risk_bands: RiskBand[];
  };
  sources: SourceRef[];
  series: SeriesRow[];
  styling?: StylingPayload;
  notes?: string;
  case_stoplight?: CaseStoplight;
  case_activity_series?: ChartPoint[];
  case_growth_series?: ChartPoint[];
}

type StoplightColor = "green" | "amber" | "red";
type StoplightKey = "growthIndicator" | "level" | "momentum" | "yearOverYear";

interface StoplightReading {
  color: StoplightColor;
  value: string;
}

interface StoplightRow {
  key: StoplightKey;
  name: string;
  reading: StoplightReading;
  four_weeks_ago: StoplightReading;
  changed_at: string;
  rule: string;
}

interface CaseStoplight {
  version: number;
  as_of: string | null;
  four_weeks_ago_date: string | null;
  source_url: string | null;
  rows: StoplightRow[];
  unavailable_reason: string | null;
}

const STOPLIGHT_COLORS: Record<StoplightColor, { label: string; className: string }> = {
  green: { label: "Green", className: "bg-green-100 text-green-800 border-green-200" },
  amber: { label: "Amber", className: "bg-amber-100 text-amber-900 border-amber-200" },
  red: { label: "Red", className: "bg-red-100 text-red-800 border-red-200" },
};

function validCaseStoplight(value: CaseStoplight | undefined, generatedAt: string): value is CaseStoplight {
  if (!value || (value.version !== 1 && value.version !== 2 && value.version !== 3) || typeof value.as_of !== "string" ||
      typeof value.four_weeks_ago_date !== "string" || !Array.isArray(value.rows) ||
      value.rows.length !== (value.version >= 2 ? 4 : 3) ||
      (value.version >= 2 && value.rows[0]?.key !== "growthIndicator")) return false;
  const buildAgeHours = (Date.now() - Date.parse(generatedAt)) / 3_600_000;
  if (!Number.isFinite(buildAgeHours) || buildAgeHours < -1 || buildAgeHours > 36) return false;
  const colors = new Set(["green", "amber", "red"]);
  return value.rows.every((row) => row && typeof row.key === "string" && typeof row.name === "string" &&
    typeof row.rule === "string" && typeof row.changed_at === "string" &&
    row.reading && colors.has(row.reading.color) && typeof row.reading.value === "string" &&
    row.four_weeks_ago && colors.has(row.four_weeks_ago.color) && typeof row.four_weeks_ago.value === "string");
}

function StoplightTable({ data }: { data: TrackerData }) {
  const stoplight = data.case_stoplight;
  if (!validCaseStoplight(stoplight, data.generated_at)) return (
    <div className="rounded-lg border border-brand-gray/30 bg-white p-4 sm:p-6">
      <h2 id="case-stoplight-heading" className="brand-navy mb-2">NYC Mpox Case Activity Stoplight</h2>
      <p className="text-sm text-gray-600">{typeof stoplight?.unavailable_reason === "string" ? stoplight.unavailable_reason : "Awaiting current, compatible stoplight data from the upstream tracker."}</p>
    </div>
  );
  const rows = stoplight.rows;
  const hasGrowthRow = stoplight.version >= 2;
  const hasWeeklyGrowth = stoplight.version === 3;
  const slowGrowthWithElevatedCounts = hasGrowthRow && rows[0].reading.color === "green" &&
    rows.some((row) => (row.key === "level" || row.key === "momentum") && row.reading.color === "red");
  const fourWeeksAgoDate = stoplight.four_weeks_ago_date;

  return (
    <div>
      <div className="rounded-lg border border-brand-gray/30 bg-white">
        <div className="border-b border-brand-gray/20 p-4 sm:p-6">
          <h2 id="case-stoplight-heading" className="brand-navy mb-2">NYC Mpox Case Activity Stoplight</h2>
          <p className="text-sm text-gray-700">
            Last published NYC Health case week ending {fmtDate(`${stoplight.as_of}T00:00:00Z`)}. NYC Health publishes these weekly counts monthly, on the second Thursday at 4 p.m. Eastern. These readings describe that release, not the intervening weeks. {hasWeeklyGrowth ? "Four views of case activity: the weekly growth trend, recent case level, 4-week versus 13-week momentum, and comparison with last year. Higher case counts and faster growth are unfavorable." : hasGrowthRow ? "Four views of case activity: the prior daily growth indicator, recent case level, momentum, and comparison with last year. Higher case counts and faster growth are unfavorable." : "Three views of case activity: recent case level, 4-week versus 13-week momentum, and comparison with last year. Higher case counts are unfavorable."}
          </p>
          {slowGrowthWithElevatedCounts && <p className="mt-2 border-l-4 border-amber-600 bg-amber-50 p-3 text-sm text-amber-950">Case activity remained elevated at the last report even though growth pace was slow. Green here is not an all-clear.</p>}
          <p className="mt-2 text-xs text-gray-600">
            Source: <a href={stoplight.source_url ?? "https://www.nyc.gov/site/doh/health/health-topics/mpox.page"} target="_blank" rel="noreferrer" className="brand-blue hover:underline">NYC Health mpox cases</a>; {hasWeeklyGrowth ? "weekly growth trend" : "case activity"} and stoplight calculations by D²Sci in the upstream tracker. Open Why? for the rule and last color change.
          </p>
          <p className="mt-1 text-xs text-gray-600 sm:hidden">Scroll the table sideways for the comparison and details.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm leading-snug">
          <thead className="bg-brand-gray/20 text-gray-700">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Dimension</th>
              <th scope="col" className="px-3 py-2 font-semibold">Stoplight</th>
              <th scope="col" className="px-3 py-2 font-semibold">Latest</th>
              <th scope="col" className="px-3 py-2 font-semibold">Four weeks ago <span className="block text-xs font-normal">As of {fmtDate(`${fourWeeksAgoDate}T00:00:00Z`)}</span></th>
              <th scope="col" className="px-3 py-2 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-brand-gray/20 align-top">
                <th scope="row" className="px-3 py-2 brand-navy font-semibold">{row.name}</th>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-2.5 py-1 font-semibold ${STOPLIGHT_COLORS[row.reading.color].className}`}>
                    <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
                    {STOPLIGHT_COLORS[row.reading.color].label}
                  </span>
                </td>
                <td className="px-3 py-2 font-medium text-gray-900">{row.reading.value}</td>
                <td className="px-3 py-2 text-gray-700">
                  {row.four_weeks_ago.value}
                  <span className="block text-xs text-gray-500">{STOPLIGHT_COLORS[row.four_weeks_ago.color].label} then</span>
                </td>
                <td className="px-3 py-2">
                  <details className="group">
                    <summary className="inline-flex cursor-pointer items-center gap-1 brand-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                      <Info className="h-4 w-4" aria-hidden="true" /> Why?
                    </summary>
                    <div className="mt-2 w-64 text-xs leading-relaxed text-gray-700">
                      <p>{row.rule}</p>
                      <p className="mt-2">Last reported color since the week ending {fmtDate(`${row.changed_at}T00:00:00Z`)}.</p>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
        <p className="border-t border-brand-gray/20 px-4 py-3 text-xs text-gray-600 sm:px-6">
          Colors are descriptive monitoring rules, not calibrated probabilities or personal medical risk. {hasWeeklyGrowth ? "Weekly growth and momentum use overlapping case counts, so the four indicators are not independent." : hasGrowthRow ? "The prior daily growth indicator and momentum use different time windows." : "The separate growth-index band measures a shorter-term signal."}
        </p>
      </div>
    </div>
  );
}

const MONTH_TICKS: { day: number; label: string }[] = [
  { day: 1, label: "Jan" },
  { day: 32, label: "Feb" },
  { day: 60, label: "Mar" },
  { day: 91, label: "Apr" },
  { day: 121, label: "May" },
  { day: 152, label: "Jun" },
  { day: 182, label: "Jul" },
  { day: 213, label: "Aug" },
  { day: 244, label: "Sep" },
  { day: 274, label: "Oct" },
  { day: 305, label: "Nov" },
  { day: 335, label: "Dec" },
];

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

interface MonthRange {
  startMonthIndex: number;
  endMonthIndex: number;
}

// Day-of-year (non-leap) for May 18, the first date the 2022 line should render.
const Y2022_START_DAY = 138;

function defaultMonthRange(): MonthRange {
  return {
    startMonthIndex: 0,
    endMonthIndex: new Date().getMonth(),
  };
}

function dayRange(monthRange: MonthRange) {
  const endMonth = monthRange.endMonthIndex + 1;
  return {
    start: MONTH_TICKS[monthRange.startMonthIndex].day,
    end: endMonth === 12 ? 365 : MONTH_TICKS[endMonth].day - 1,
  };
}

function buildChartData(
  data: TrackerData,
  years: number[],
  field: ChartField,
  monthRange: MonthRange,
  sourceRows: ChartPoint[] = data.series,
) {
  const wanted = new Set(years);
  const range = dayRange(monthRange);
  const byDay = new Map<number, any>();
  sourceRows.forEach((row) => {
    if (!wanted.has(row.year)) return;
    if (row.day_index < range.start || row.day_index > range.end) return;
    if (row.year === 2022 && row.day_index < Y2022_START_DAY) return;
    if (!byDay.has(row.day_index)) {
      byDay.set(row.day_index, {
        day_index: row.day_index,
        month_day: row.month_day,
      });
    }
    byDay.get(row.day_index)![`y${row.year}`] = row[field];
    byDay.get(row.day_index)![`cases${row.year}`] = row.weekly_cases ?? row.cases;
  });
  return Array.from(byDay.values()).sort((a, b) => a.day_index - b.day_index);
}

function ChartTooltip({ active, label, field, hoverRowsByYear, weekly, styling }: any) {
  const dayIndex = Number(label);
  if (!active || !Number.isFinite(dayIndex)) return null;
  const formatter = (v: number | null | undefined) =>
    v === null || v === undefined
      ? "--"
      : field === "risk_index"
        ? v.toFixed(2)
        : field.endsWith("_percent")
          ? `${v > 0 ? "+" : ""}${v.toLocaleString()}%`
          : v.toLocaleString();
  const observations = Array.from((hoverRowsByYear as Map<number, ChartPoint[]>).entries())
    .sort(([a], [b]) => b - a)
    .map(([year, rows]) => {
      const tolerance = weekly && rows[0]?.frequency !== "daily" ? 3 : 0;
      const row = rows.filter((candidate) => Math.abs(candidate.day_index - dayIndex) <= tolerance)
        .sort((a, b) => Math.abs(a.day_index - dayIndex) - Math.abs(b.day_index - dayIndex) || b.day_index - a.day_index)[0] ?? null;
      return { year, row };
    });
  if (observations.every(({ row }) => !row)) return null;
  const dayLabel = new Date(Date.UTC(2001, 0, dayIndex)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <div className="max-w-[285px] rounded-md border border-brand-gray/40 bg-white px-3 py-2 text-xs shadow-md">
      <div className="font-semibold brand-navy mb-1">{weekly ? `Around ${dayLabel}` : dayLabel}</div>
      {observations.map(({ year, row }) => {
          const cases = row?.weekly_cases ?? row?.cases;
          const value = row?.[field as ChartField];
          return (
            <div key={year} className="mt-1.5 grid grid-cols-[12px_1fr_auto] items-center gap-x-2">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ background: styling.yearColors[String(year)] ?? FALLBACK_YEAR_COLOR }}
              />
              <span className="brand-navy">{year}:</span>
              <span className="font-medium">{row ? formatter(value) : "—"}</span>
              <span className="col-start-2 col-end-4 text-gray-500">
                {row ? `${weekly ? `${row.frequency === "daily" ? "7 days ending" : "Week ending"} ${fmtDate(`${row.date}T00:00:00Z`)} · ` : ""}${cases ?? "--"} ${field === "risk_index" ? "observed daily cases" : field === "cumulative_cases" ? "daily-equivalent cases" : row.frequency === "daily" ? "cases in trailing 7 days" : `case${cases === 1 ? "" : "s"} that week`}` : "No nearby observation"}
              </span>
            </div>
          );
        })}
    </div>
  );
}

function ChartMark() {
  return (
    <div className="mt-1 flex justify-end text-[9px] leading-none text-gray-400">
      <span>© D²Sci public analytics</span>
    </div>
  );
}

function PatternLegend({ items }: { items: ReadonlyArray<{ name: string; color: string; dash?: string; pattern: string }> }) {
  return <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-700">
    {items.map((item) => <span key={item.name} className="inline-flex items-center gap-1.5" aria-label={`${item.name}, ${item.pattern} line`}>
      <svg width="34" height="12" aria-hidden="true"><line x1="1" x2="33" y1="6" y2="6" stroke={item.color} strokeWidth="2.8" strokeDasharray={item.dash} strokeLinecap="round" /></svg>
      {item.name}
    </span>)}
  </div>;
}

const ACTIVITY_BANDS: Record<string, StyledRiskBand[]> = {
  weekly_growth_percent: [
    { label: "Green ≤+5%", min: null, max: 5, color: "#d8e8df", textColor: "#256d4a" },
    { label: "Amber +5–15%", min: 5, max: 15, color: "#fff0bf", textColor: "#8a6300" },
    { label: "Red >+15%*", min: 15, max: null, color: "#f3b7b2", textColor: "#9a2f29" },
  ],
  four_week_cases: [
    { label: "Green <15", min: null, max: 15, color: "#d8e8df", textColor: "#256d4a" },
    { label: "Amber 15–59", min: 15, max: 60, color: "#fff0bf", textColor: "#8a6300" },
    { label: "Red ≥60", min: 60, max: null, color: "#f3b7b2", textColor: "#9a2f29" },
  ],
  momentum_percent: [
    { label: "Green ≤+15%", min: null, max: 15, color: "#d8e8df", textColor: "#256d4a" },
    { label: "Amber +15–40%", min: 15, max: 40, color: "#fff0bf", textColor: "#8a6300" },
    { label: "Red >+40%", min: 40, max: null, color: "#f3b7b2", textColor: "#9a2f29" },
  ],
  year_over_year_percent: [
    { label: "Green ≤−20%", min: null, max: -20, color: "#d8e8df", textColor: "#256d4a" },
    { label: "Amber −20–+20%", min: -20, max: 20, color: "#fff0bf", textColor: "#8a6300" },
    { label: "Red >+20%", min: 20, max: null, color: "#f3b7b2", textColor: "#9a2f29" },
  ],
};

function MomentumComponentsChart({ data, selectedYears, monthRange, useLinePatterns }: { data: TrackerData; selectedYears: number[]; monthRange: MonthRange; useLinePatterns: boolean }) {
  const year = selectedYears.at(-1);
  const range = dayRange(monthRange);
  // The upstream feed calculates rolling averages across the full history;
  // these filters affect display only, including at month/year boundaries.
  const rows = (data.case_activity_series ?? []).filter((row) => row.year === year && (row.year !== 2022 || row.day_index >= Y2022_START_DAY) && row.day_index >= range.start && row.day_index <= range.end);
  const latestWeek = rows.at(-1);
  const lines = [
    { key: "weekly_cases", name: "Weekly cases", color: "#2876d2", dash: undefined, pattern: "solid" },
    { key: "four_week_average", name: "4-week average", color: "#ee6536", dash: "10 4", pattern: "long dash" },
    { key: "thirteen_week_average", name: "13-week average", color: "#19a974", dash: "2 3", pattern: "dotted" },
  ] as const;
  return (
    <div className="w-full">
      <div className="rounded-md border border-brand-gray/30 bg-white p-2">
        <div className="ml-2 text-sm font-semibold brand-navy">NYC Mpox Weekly Cases and Rolling Averages — {year ?? "No year selected"}</div>
        <div className="ml-2 text-xs text-gray-600">NYC Health · Months: {MONTH_TICKS[monthRange.startMonthIndex].label}–{MONTH_TICKS[monthRange.endMonthIndex].label} · Latest source week ending {fmtDate(`${data.latest_data_date}T00:00:00Z`)}</div>
        <div className="ml-2 text-xs text-gray-500">Y-axis: cases per week · X-axis: calendar month and day at week endings</div>
        <div style={{ height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 16, right: 24, bottom: 24, left: 12 }}>
              <CartesianGrid key="momentum-grid" stroke="#e5e7eb" vertical={false} />
              <XAxis key="momentum-x-axis" dataKey="day_index" type="number" domain={[range.start, range.end]} ticks={MONTH_TICKS.filter((m) => m.day >= range.start && m.day <= range.end).map((m) => m.day)} tickFormatter={(d) => MONTH_TICKS.find((m) => m.day === d)?.label ?? ""} tick={{ fontSize: 11 }} />
              <YAxis key="momentum-y-axis" domain={[0, "auto"]} tick={{ fontSize: 11 }} />
              <Tooltip key="momentum-tooltip" labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? "Week ending"} formatter={(value: any, name: any) => [Number(value).toFixed(2), String(name)]} />
              <Legend key="momentum-legend" verticalAlign="bottom" content={() => <PatternLegend items={lines.map((line) => ({ ...line, dash: useLinePatterns ? line.dash : undefined, pattern: useLinePatterns ? line.pattern : "solid" }))} />} />
              {lines.map((line) => <Line key={line.key} type="linear" dataKey={line.key} name={line.name} stroke={line.color} strokeDasharray={useLinePatterns ? line.dash : undefined} strokeWidth={line.key === "weekly_cases" ? 2.6 : 3} dot={false} activeDot={useLinePatterns} connectNulls={false} isAnimationActive={false} />)}
              {latestWeek && <ReferenceLine key="momentum-latest-week" x={latestWeek.day_index} stroke="#0f172a" strokeDasharray="4 4" />}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ChartMark />
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer brand-blue font-semibold">View NYC Mpox weekly cases and rolling averages as a table</summary>
        <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[440px] border-collapse text-left text-xs tabular-nums">
          <caption className="py-2 text-left font-semibold brand-navy">NYC Mpox weekly cases, 4-week average and 13-week average — {year ?? "no year selected"}. NYC Health data through {fmtDate(`${data.latest_data_date}T00:00:00Z`)}. Cases per week.</caption>
          <thead><tr><th scope="col">Week ending</th>{lines.map((line) => <th key={line.key} scope="col">{line.name}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.date}><th scope="row">{row.date}</th>{lines.map((line) => { const value = row[line.key]; return <td key={line.key}>{value == null ? "—" : value.toFixed(2)}</td>; })}</tr>)}</tbody>
        </table></div>
      </details>
    </div>
  );
}

function TrackerChart({
  data,
  styling,
  selectedYears,
  monthRange,
  field,
  showRiskBands,
  yLabel,
  sourceRows,
  title,
  useLinePatterns,
}: {
  data: TrackerData;
  styling: Styling;
  selectedYears: number[];
  monthRange: MonthRange;
  field: ChartField;
  showRiskBands?: boolean;
  yLabel: string;
  sourceRows?: ChartPoint[];
  title?: string;
  useLinePatterns: boolean;
}) {
  const chartData = useMemo(
    () => buildChartData(data, selectedYears, field, monthRange, sourceRows),
    [data, selectedYears, field, monthRange, sourceRows],
  );
  const plottedYears = selectedYears.filter((year) => chartData.some((row) => {
    const value = row[`y${year}`];
    return typeof value === "number" && Number.isFinite(value);
  }));
  const frequencyByYear = Object.fromEntries(plottedYears.map((year) => [year,
    field === "weekly_growth_percent" ? (sourceRows ?? []).find((row) => row.year === year)?.frequency ?? "weekly" : null,
  ]));
  const hoverRowsByYear = useMemo(() => {
    const range = dayRange(monthRange);
    const rowsByYear = new Map<number, ChartPoint[]>();
    for (const year of selectedYears) {
      const rows = (sourceRows ?? data.series).filter((row) => row.year === year &&
        row.day_index >= range.start && row.day_index <= range.end &&
        (year !== 2022 || row.day_index >= Y2022_START_DAY) &&
        typeof row[field] === "number" && Number.isFinite(row[field]));
      if (rows.length) rowsByYear.set(year, rows);
    }
    return rowsByYear;
  }, [data.series, sourceRows, selectedYears, field, monthRange]);

  const allValues = chartData
    .flatMap((row) =>
      selectedYears.map((y) => row[`y${y}`] as number | null | undefined),
    )
    .filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));

  let yMin = Math.min(0, ...allValues);
  let yMax = Math.max(1, ...allValues);
  if (showRiskBands) {
    yMin = Math.min(yMin, -1);
  }
  if (field === "risk_index") {
    yMax = Math.max(yMax, 4);
  }

  // Generate "nice" round-number ticks at consistent intervals.
  const niceTicks = (min: number, max: number, target = 6) => {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      return [min];
    }
    const span = max - min;
    const rawStep = span / Math.max(1, target - 1);
    const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const candidates = [1, 2, 2.5, 5, 10];
    const step =
      (candidates.find((c) => c * pow >= rawStep) || 10) * pow;
    const start = Math.floor(min / step) * step;
    const end = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let v = start; v <= end + step / 2; v += step) {
      ticks.push(Number(v.toFixed(10)));
    }
    return ticks;
  };

  const bands = showRiskBands ? styling.riskBands : ACTIVITY_BANDS[field] ?? [];
  if (bands.length && bands[0].max !== null) yMin = Math.min(yMin, bands[0].max - 1);
  if (bands.length) yMax = Math.max(yMax, (bands.at(-1)?.min ?? 0) + 1);
  const yTicks = niceTicks(yMin, yMax, 6);
  yMin = yTicks[0];
  yMax = yTicks[yTicks.length - 1];
  const tickStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1;
  const tickDecimals = tickStep >= 1 ? 0 : tickStep >= 0.1 ? 1 : 2;
  const range = dayRange(monthRange);

  const latest = (sourceRows ?? data.series).find(
    (r) => r.year === data.current_year && r.date === data.latest_data_date,
  );

  const chartTitle = title ?? (field === "risk_index"
    ? "NYC Mpox Case Growth Indicator"
    : "NYC Mpox Cumulative Reported Cases");
  const chartContext = `NYC Health · Years plotted: ${plottedYears.length ? plottedYears.map((year) => `${year}${frequencyByYear[year] ? ` ${frequencyByYear[year]}` : ""}`).join(", ") : "none"} · Months: ${MONTH_TICKS[monthRange.startMonthIndex].label}–${MONTH_TICKS[monthRange.endMonthIndex].label} · Latest source week ending ${fmtDate(`${data.latest_data_date}T00:00:00Z`)}`;

  return (
    <div className="w-full">
      <div className="rounded-md border border-brand-gray/30 bg-white p-2">
      <div className="ml-2 text-sm font-semibold brand-navy">{chartTitle}</div>
      <div className="ml-2 text-xs text-gray-600">{chartContext}</div>
      <div className="text-xs text-gray-500 mb-1 ml-2">{yLabel}</div>
      <div style={{ height: 360 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 16, right: 24, bottom: 24, left: 12 }}
        >
          <CartesianGrid key="grid" stroke="#e5e7eb" vertical={false} />
          {bands.map((band, i) => {
            const from = band.min ?? yMin;
            const to = band.max ?? yMax;
            if (to <= yMin || from >= yMax) return null;
            return (
              <ReferenceArea
                key={`band-${band.label}-${i}`}
                id={`band-${band.label}-${i}`}
                y1={Math.max(from, yMin)}
                y2={Math.min(to, yMax)}
                fill={band.color ?? styling.bandStyles[band.label]?.bg ?? FALLBACK_BAND_BG}
                fillOpacity={0.6}
                ifOverflow="hidden"
              />
            );
          })}
          <XAxis
            key="x"
            dataKey="day_index"
            type="number"
            domain={[range.start, range.end]}
            ticks={MONTH_TICKS.filter((m) => m.day >= range.start && m.day <= range.end).map((m) => m.day)}
            tickFormatter={(d) => {
              const t = MONTH_TICKS.find((m) => m.day === d);
              return t ? t.label : "";
            }}
            tick={{ fontSize: 11, fill: "#475569" }}
            stroke="#94a3b8"
          />
          <YAxis
            key="y"
            domain={[yMin, yMax]}
            ticks={yTicks}
            interval={0}
            tickFormatter={(v) => Number(v).toFixed(tickDecimals)}
            tick={{ fontSize: 11, fill: "#475569" }}
            stroke="#94a3b8"
          />
          <Tooltip
            key="tooltip"
            content={<ChartTooltip field={field} hoverRowsByYear={hoverRowsByYear} weekly={!!sourceRows} styling={styling} />}
            cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }}
          />
          <Legend
            key="legend"
            verticalAlign="bottom"
            content={() => <PatternLegend items={plottedYears.map((year) => ({ name: `${year}${frequencyByYear[year] ? ` · ${frequencyByYear[year]}` : ""}`, color: styling.yearColors[String(year)] ?? FALLBACK_YEAR_COLOR, dash: useLinePatterns ? linePatternForYear(year).dash : undefined, pattern: useLinePatterns ? linePatternForYear(year).label : "solid" }))} />}
          />
          {latest && typeof latest[field] === "number" && Number.isFinite(latest[field]) &&
            selectedYears.includes(data.current_year) &&
            latest.day_index >= range.start &&
            latest.day_index <= range.end && (
            <ReferenceLine
              key="latest-data-marker"
              id="latest-data-marker"
              x={latest.day_index}
              stroke="#0f172a"
              strokeDasharray="4 4"
              label={{
                value: `Latest data ${fmtDate(`${data.latest_data_date}T00:00:00Z`)}`,
                position: "top",
                fill: "#0f172a",
                fontSize: 11,
              }}
            />
          )}
          {/* Reporting weeks from different years interleave on this calendar axis. */}
          {plottedYears.map((year) => (
            <Line
              key={year}
              id={`line-${year}`}
              type="linear"
              dataKey={`y${year}`}
              name={`${year}${frequencyByYear[year] ? ` · ${frequencyByYear[year]}` : ""}`}
              stroke={styling.yearColors[String(year)] ?? FALLBACK_YEAR_COLOR}
              strokeDasharray={useLinePatterns ? linePatternForYear(year).dash : undefined}
              strokeWidth={year === data.current_year ? 3.4 : 2.5}
              strokeOpacity={1}
              dot={useLinePatterns && field === "weekly_growth_percent" && frequencyByYear[year] === "weekly" ? { r: 2 } : false}
              activeDot={useLinePatterns}
              connectNulls={true}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      </div>
      <ChartMark />
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer brand-blue font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">View {chartTitle} values as a table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[440px] border-collapse text-left text-xs tabular-nums">
            <caption className="py-2 text-left font-semibold brand-navy">{chartTitle}. NYC Health data through {fmtDate(`${data.latest_data_date}T00:00:00Z`)}. Selected years and months.</caption>
            <thead className="bg-brand-gray/20">
              <tr>
                <th scope="col" className="border-b border-brand-gray/30 p-2">Month and day</th>
                {selectedYears.map((year) => <th key={year} scope="col" className="border-b border-brand-gray/30 p-2">{year}</th>)}
              </tr>
            </thead>
            <tbody>
              {chartData.map((row) => (
                <tr key={row.day_index}>
                  <th scope="row" className="border-b border-brand-gray/20 p-2 font-medium">{row.month_day}</th>
                  {selectedYears.map((year) => {
                    const value = row[`y${year}`] as number | null | undefined;
                    return <td key={year} className="border-b border-brand-gray/20 p-2">{value === null || value === undefined ? "—" : field === "risk_index" ? value.toFixed(2) : field.endsWith("_percent") ? `${value > 0 ? "+" : ""}${value.toLocaleString()}%` : value.toLocaleString()}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function YearToggles({
  years,
  selected,
  onToggle,
  styling,
}: {
  years: number[];
  selected: Set<number>;
  onToggle: (y: number) => void;
  styling: Styling;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {years.map((y) => {
        const active = selected.has(y);
        return (
          <button
            key={y}
            onClick={() => onToggle(y)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              active
                ? "text-white border-transparent"
                : "bg-white border-brand-gray/40 text-brand-navy hover:bg-brand-gray/20"
            }`}
            style={
              active
                ? { backgroundColor: styling.yearColors[String(y)] ?? FALLBACK_YEAR_COLOR }
                : undefined
            }
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle"
              style={{ background: styling.yearColors[String(y)] ?? FALLBACK_YEAR_COLOR }}
            />
            {y}
          </button>
        );
      })}
    </div>
  );
}

function MonthControls({
  value,
  onChange,
}: {
  value: MonthRange;
  onChange: (value: MonthRange) => void;
}) {
  const setStart = (startMonthIndex: number) => {
    onChange({
      startMonthIndex,
      endMonthIndex: Math.max(value.endMonthIndex, startMonthIndex),
    });
  };
  const setEnd = (endMonthIndex: number) => {
    onChange({
      startMonthIndex: Math.min(value.startMonthIndex, endMonthIndex),
      endMonthIndex,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-600">
      <span className="brand-navy">Zoom</span>
      <select
        aria-label="Start month"
        className="h-8 rounded-md border border-brand-gray/40 bg-white px-2 brand-navy"
        value={value.startMonthIndex}
        onChange={(event) => setStart(Number(event.target.value))}
      >
        {MONTH_TICKS.map((month, index) => (
          <option key={month.label} value={index}>
            {month.label}
          </option>
        ))}
      </select>
      <span>to</span>
      <select
        aria-label="End month"
        className="h-8 rounded-md border border-brand-gray/40 bg-white px-2 brand-navy"
        value={value.endMonthIndex}
        onChange={(event) => setEnd(Number(event.target.value))}
      >
        {MONTH_TICKS.map((month, index) => (
          <option key={month.label} value={index}>
            {month.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const RESOURCES = [
  {
    href: "https://callen-lorde.org/mpox/",
    title: "Callen-Lorde: Mpox",
    desc: "LGBTQ+ health-center guidance on symptoms, exposure, vaccination, care, and stigma reduction.",
  },
  {
    href: "https://www.nyc.gov/site/doh/health/health-topics/mpox.page",
    title: "NYC Health: Mpox",
    desc: "Local transmission, prevention, symptoms, recent NYC case context, and links to city services.",
  },
  {
    href: "https://www.nyc.gov/site/doh/health/health-topics/mpox-vaccination.page",
    title: "NYC Health: Mpox Vaccination",
    desc: "Vaccine eligibility, two-dose guidance, post-exposure timing, and the NYC Health Map.",
  },
  {
    href: "https://www.nyc.gov/site/doh/health/health-topics/sexual-health.page",
    title: "NYC Sexual Health Services",
    desc: "Sexual health clinics, vaccination context, STI prevention, and LGBTQ+ health resources.",
  },
  {
    href: "https://www.cdc.gov/monkeypox/prevention/safer-sex-social-gatherings-and-mpox.html",
    title: "CDC: Safer Sex and Social Gatherings",
    desc: "Harm-reduction guidance for sex, parties, travel, events, and close-contact settings.",
  },
];

export function PublicAnalyticsPage() {
  const [data, setData] = useState<TrackerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  const [useLinePatterns, setUseLinePatterns] = useState(false);
  const [monthRange, setMonthRange] = useState<MonthRange>({
    startMonthIndex: 0,
    endMonthIndex: MONTH_TICKS.length - 1,
  });

  useEffect(() => {
    let cancelled = false;
    fetch(DATA_URL, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: TrackerData) => {
        if (cancelled) return;
        setData(d);
        const years = Array.from(new Set(d.series.map((s) => s.year))).sort(
          (a, b) => a - b,
        );
        const currentYear = d.current_year;
        const targets = [currentYear - 1, currentYear];
        const defaults = targets.filter((y) => years.includes(y));
        setSelectedYears(new Set(defaults.length ? defaults : years.slice(-3)));
        setMonthRange(defaultMonthRange());
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const availableYears = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.series.map((s) => s.year))).sort(
      (a, b) => a - b,
    );
  }, [data]);

  const toggleYear = (y: number) => {
    setSelectedYears((prev) => {
      const next = new Set(prev);
      if (next.has(y)) next.delete(y);
      else next.add(y);
      return next;
    });
  };

  const selectedYearsArray = useMemo(
    () => Array.from(selectedYears).sort((a, b) => a - b),
    [selectedYears],
  );

  const styling = useMemo(() => data ? mergeStyling(data.styling) : DEFAULT_STYLING, [data]);

  const currentStoplight = data && validCaseStoplight(data.case_stoplight, data.generated_at) ? data.case_stoplight : null;
  const band = currentStoplight ? data?.summary.weekly_growth_label || "Weekly trend unavailable" : data || error ? "Weekly trend unavailable" : "Loading";
  const growthColor = currentStoplight ? data?.summary.weekly_growth_color : null;
  const bandBg = { green: "#d8e8df", amber: "#fff0bf", red: "#f3b7b2" }[growthColor ?? ""] ?? FALLBACK_BAND_BG;
  const bandText = { green: "#256d4a", amber: "#8a6300", red: "#9a2f29" }[growthColor ?? ""] ?? FALLBACK_BAND_TEXT;
  const redIndicatorCount = currentStoplight?.rows.filter((row) => row.reading.color === "red").length ?? 0;

  const cards = [
    {
      icon: <Activity className="h-8 w-8 brand-blue" />,
      title: "Latest reported signal",
      description:
        "A clear, at-a-glance read of NYC mpox case activity derived from the latest case reporting — refreshed automatically when NYC Health updates its data.",
    },
    {
      icon: <History className="h-8 w-8 brand-teal" />,
      title: "Historical context",
      description:
        "Comparisons against prior outbreak periods help frame whether the latest reported signal is elevated, normal, or trending — turning raw counts into informed perspective.",
    },
    {
      icon: <RefreshCw className="h-8 w-8 brand-blue" />,
      title: "Automated updates",
      description:
        "The tracker pulls from official NYC sources on a scheduled cadence, with links to respected public health resources for deeper guidance and clinical context.",
    },
  ];

  return (
    <div className="min-h-screen">

      {/* Hero */}
      <section className="border-b border-border bg-background px-6 py-12 lg:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <p className="text-[10px] tracking-[0.16em] text-accent">
            PUBLIC DATA / NYC HEALTH SURVEILLANCE
          </p>
          <span className="text-xs text-muted-foreground">{data ? `Latest source week ending ${fmtDate(`${data.latest_data_date}T00:00:00Z`)}` : "Checking the latest available source data…"}</span>
          </div>
          <h1 className="max-w-4xl font-display text-4xl font-normal leading-tight sm:text-6xl">
            NYC Mpox<br />Spread Risk Tracker<span className="text-accent">.</span>
          </h1>
          <p className="mb-7 mt-5 max-w-2xl text-sm leading-7 text-muted-foreground">
            Reported cases, weekly trends, and historical context. An independent public tool based on NYC Health data—not an estimate of individual risk.
          </p>
          <div className="flex flex-wrap items-center gap-5">
            <Button
              size="lg"
              className="rounded-none bg-primary text-white hover:bg-accent"
              onClick={() =>
                document
                  .getElementById("indicator")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              View Indicator
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-none border-border bg-transparent text-foreground hover:bg-secondary"
              onClick={() => window.open(REPO_URL, "_blank")}
            >
              <Github className="h-4 w-4 mr-2" />
              View Methodology
            </Button>
            <Link to="/work/mpox" className="border-b border-border pb-1 text-xs text-muted-foreground hover:text-accent">About this project ↗</Link>
          </div>
        </div>
      </section>

      {/* Summary metrics */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          {error && (
            <div className="mb-6 flex items-start gap-3 p-4 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-sm">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Live data unavailable.</strong> Couldn't fetch the
                latest tracker data — please try the{" "}
                <a
                  href={TRACKER_URL}
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  full tracker
                </a>
                .
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div
              className="rounded-lg p-5 border"
              style={{
                background: bandBg,
                borderColor: "rgba(0,0,0,0.05)",
              }}
            >
              <div className="text-xs uppercase tracking-wide text-gray-700 mb-1">
                Weekly case growth at last report
              </div>
              <div
                className="text-2xl font-bold"
                style={{ color: bandText }}
              >
                {band}
              </div>
            </div>
            <div className="rounded-lg p-5 bg-brand-gray/20 border border-brand-gray/30">
              <div className="text-xs uppercase tracking-wide text-gray-700 mb-1">
                Indicators red at last report
              </div>
              <div className="text-2xl font-bold brand-navy">
                {currentStoplight ? `${Math.round((redIndicatorCount / currentStoplight.rows.length) * 100)}%` : "--"}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {currentStoplight ? `${redIndicatorCount} of ${currentStoplight.rows.length} indicators at last report` : "Last reported stoplight unavailable"}
              </div>
            </div>
            <div className="rounded-lg p-5 bg-brand-gray/20 border border-brand-gray/30">
              <div className="text-xs uppercase tracking-wide text-gray-700 mb-1">
                Cases in last 28 reported days
              </div>
              <div className="text-2xl font-bold brand-navy">
                {data?.summary.cases_last_28_days !== null &&
                data?.summary.cases_last_28_days !== undefined
                  ? data.summary.cases_last_28_days.toLocaleString()
                  : "--"}
              </div>
            </div>
            <div className="rounded-lg p-5 bg-brand-gray/20 border border-brand-gray/30">
              <div className="text-xs uppercase tracking-wide text-gray-700 mb-1">
                Latest data
              </div>
              <div className="text-2xl font-bold brand-navy">
                {data?.latest_data_date
                  ? fmtDate(`${data.latest_data_date}T00:00:00Z`)
                  : "--"}
              </div>
            </div>
          </div>
          {data && (
            <p className="text-xs text-gray-500 mt-3">
              Generated {fmtDate(data.generated_at)}
            </p>
          )}
        </div>
      </section>

      {/* Weekly case activity stoplight */}
      <section className="py-12 px-4 bg-white" aria-labelledby="case-stoplight-heading">
        <div className="max-w-5xl mx-auto">
          {data ? (
            <StoplightTable data={data} />
          ) : (
            <div className="rounded-lg border border-brand-gray/30 bg-white p-6 text-gray-500 text-sm">
              <h2 id="case-stoplight-heading" className="brand-navy mb-2">NYC Mpox Case Activity Stoplight</h2>
              {error ? "Stoplight unavailable while tracker data cannot be loaded." : "Loading case activity…"}
            </div>
          )}
        </div>
      </section>

      {/* Completed-week growth trend; the controls also apply to the historical daily view. */}
      <section id="indicator" className="py-12 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          {data && (
            <div className="flex flex-col gap-2 md:items-end mb-4" aria-label="Case growth chart controls">
                <YearToggles
                  years={availableYears}
                  selected={selectedYears}
                  onToggle={toggleYear}
                  styling={styling}
                />
                <MonthControls value={monthRange} onChange={setMonthRange} />
            </div>
          )}
          <Card>
            <CardContent className="p-4 sm:p-6">
              <h2 id="growth-chart-heading" className="brand-navy mb-2">NYC Mpox Weekly Case Growth Trend by Calendar Date</h2>
              <p className="text-sm text-gray-700 mb-2">
                Estimated percentage change per week across eight consecutive seven-day blocks. Historical daily sources produce a rolling point each day; weekly-only sources produce a point at each completed week. Positive values mean cases are rising. The stoplight remains weekly and requires at least 15 cases in four weeks for red. Hover shows the actual ending date of each year's seven-day block.
              </p>
          <p className="text-xs text-gray-600 mb-5">
                {data ? `Source: NYC Health · Years shown: ${selectedYearsArray.length ? selectedYearsArray.join(", ") : "none"} · Months shown: ${MONTH_TICKS[monthRange.startMonthIndex].label}–${MONTH_TICKS[monthRange.endMonthIndex].label} · Latest source week ending ${fmtDate(`${data.latest_data_date}T00:00:00Z`)}` : "Loading source data…"}
              </p>
              {data?.case_stoplight?.version === 3 && (data.case_growth_series ?? data.case_activity_series)?.some((row) => row.weekly_growth_percent !== null && row.weekly_growth_percent !== undefined) ? (
                <figure aria-labelledby="growth-chart-heading">
                  <TrackerChart
                    data={data}
                    styling={styling}
                    selectedYears={selectedYearsArray}
                    useLinePatterns={useLinePatterns}
                    monthRange={monthRange}
                    field="weekly_growth_percent"
                    sourceRows={data.case_growth_series ?? data.case_activity_series}
                    title="NYC Mpox Weekly Case Growth Trend"
                    yLabel="Estimated weekly case growth (%)"
                  />
                  <div className="flex flex-wrap gap-2 mt-4 justify-center">
                    {ACTIVITY_BANDS.weekly_growth_percent.map((b) => (
                      <span
                        key={b.label}
                        className="text-xs px-2 py-1 rounded-md border"
                        style={{
                          background: b.color,
                          color: b.textColor,
                          borderColor: "rgba(0,0,0,0.06)",
                        }}
                      >
                        {b.label}
                      </span>
                    ))}
                    <span className="text-xs px-2 py-1 rounded-md border border-brand-gray/40 text-brand-navy">
                      — — Latest data ({data.latest_data_date})
                    </span>
                  </div>
                  <figcaption className="mt-4 text-xs text-gray-600">
                    Source: <a href="https://www.nyc.gov/site/doh/health/health-topics/mpox.page" target="_blank" rel="noreferrer" className="brand-blue hover:underline">NYC Health mpox case data</a>; eight-week log-linear trend by D²Sci. Daily-source dates use eight non-overlapping trailing seven-day totals and are recalculated daily; weekly-source dates use eight completed weekly totals. The legend labels each year's frequency. X-axis: calendar month and day; Y-axis: estimated percentage change per week. Shading shows rate cutoffs; red in the stoplight additionally requires at least 15 cases in the latest four weeks. This is not a transmission or personal-risk estimate.
                  </figcaption>
                </figure>
              ) : (
                <div className="h-[380px] flex items-center justify-center text-gray-400 text-sm">
                  {error ? "Chart unavailable" : data ? "Awaiting updated weekly-growth feed" : "Loading…"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Weekly case activity charts; the controls above apply to each chart. */}
      {([
        { id: "level-chart-heading", title: "NYC Mpox Recent Case Level by Calendar Date", description: "Reported cases in the trailing four complete weeks, plotted at each week-ending date. Higher counts are unfavorable.", field: "four_week_cases", unit: "Cases in trailing four weeks", note: "Earlier years use daily case reports aggregated by week." },
        { id: "momentum-chart-heading", title: "NYC Mpox Momentum: Four-Week vs 13-Week Average", description: "Weekly reported cases with their four- and 13-week rolling averages, followed by the percentage difference between those averages. An increase is unfavorable; declines greater than 15% remain green.", field: "momentum_percent", unit: "Percentage difference in weekly averages", note: "The component chart shows the most recent selected year. Rolling averages use preceding weeks outside the visible months. Before the first reported 2022 case on May 19, days are assumed to have zero cases; early 2022 percentages are sensitive to this low comparison level." },
        { id: "year-comparison-chart-heading", title: "NYC Mpox 13-Week Percentage Change Versus Last Year", description: "Percentage difference between a trailing 13-week case total and the 13 weeks ending 52 weeks earlier. Above zero means more cases than a year earlier.", field: "year_over_year_percent", unit: "Percentage change vs 52 weeks earlier", note: "Zero-baseline comparisons have no plotted percentage; the table separately marks 1–4 new cases amber and 5 or more red." },
      ] as const).map((chart) => (
        <section key={chart.field} className="py-12 px-4 bg-white">
          <div className="max-w-6xl mx-auto">
            <Card><CardContent className="p-4 sm:p-6">
              <h2 id={chart.id} className="brand-navy mb-2">{chart.title}</h2>
              <p className="text-sm text-gray-700 mb-2">{chart.description}</p>
              <p className="text-xs text-gray-600 mb-5">
                {data ? `Source: NYC Health · Years shown: ${selectedYearsArray.length ? selectedYearsArray.join(", ") : "none"} · Months shown: ${MONTH_TICKS[monthRange.startMonthIndex].label}–${MONTH_TICKS[monthRange.endMonthIndex].label} · Latest source week ending ${fmtDate(`${data.latest_data_date}T00:00:00Z`)}` : "Loading source data…"}
              </p>
              {data?.case_activity_series?.length ? (
                <figure aria-labelledby={chart.id}>
                  {chart.field === "momentum_percent" && (
                    <div className="mb-8">
                      <h3 className="brand-navy font-semibold mb-2">Weekly cases and rolling averages</h3>
                      <MomentumComponentsChart data={data} selectedYears={selectedYearsArray} monthRange={monthRange} useLinePatterns={useLinePatterns} />
                      <p className="mt-2 text-xs text-gray-600">Source: NYC Health mpox cases; weekly counts and rolling averages by D²Sci. The year and month controls above apply.</p>
                      <h3 className="brand-navy font-semibold mt-8 mb-2">Momentum percentage by calendar date</h3>
                    </div>
                  )}
                  <TrackerChart
                    data={data}
                    styling={styling}
                    selectedYears={selectedYearsArray}
                    useLinePatterns={useLinePatterns}
                    monthRange={monthRange}
                    field={chart.field}
                    sourceRows={data.case_activity_series}
                    title={chart.title}
                    yLabel={chart.unit}
                  />
                  <div className="flex flex-wrap gap-2 mt-4 justify-center">
                    {(ACTIVITY_BANDS[chart.field] ?? []).map((band) => <span key={band.label} className="text-xs px-2 py-1 rounded-md border" style={{ background: band.color, color: band.textColor }}>{band.label}</span>)}
                  </div>
                  <figcaption className="mt-4 text-xs text-gray-600">
                    Source: <a href="https://www.nyc.gov/site/doh/health/health-topics/mpox.page" target="_blank" rel="noreferrer" className="brand-blue hover:underline">NYC Health mpox cases</a>; weekly comparison by D²Sci. X-axis: calendar month and day at week endings; Y-axis: {chart.unit}. {chart.note} The year and month controls above apply to this chart.
                  </figcaption>
                </figure>
              ) : (
                <p className="text-sm text-gray-600">{error ? "Chart unavailable while tracker data cannot be loaded." : "Awaiting weekly case-activity history from the upstream tracker."}</p>
              )}
            </CardContent></Card>
          </div>
        </section>
      ))}

      {/* Cumulative Cases chart */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <h2 id="cumulative-chart-heading" className="brand-navy mb-2">NYC Mpox Cumulative Reported Cases by Calendar Year</h2>
              <p className="text-sm text-gray-700 mb-2">Year-to-date reported cases, aligned by calendar month and day for comparison. Each line starts again at the beginning of its year.</p>
              <p className="text-xs text-gray-600 mb-5">
                {data ? `Source: NYC Health · Years shown: ${selectedYearsArray.length ? selectedYearsArray.join(", ") : "none"} · Months shown: ${MONTH_TICKS[monthRange.startMonthIndex].label}–${MONTH_TICKS[monthRange.endMonthIndex].label} · Latest source week ending ${fmtDate(`${data.latest_data_date}T00:00:00Z`)}` : "Loading source data…"}
              </p>
              {data ? (
                <figure aria-labelledby="cumulative-chart-heading">
                  <TrackerChart
                    data={data}
                    styling={styling}
                    selectedYears={selectedYearsArray}
                    useLinePatterns={useLinePatterns}
                    monthRange={monthRange}
                    field="cumulative_cases"
                    yLabel="Cumulative reported cases"
                  />
                  <figcaption className="mt-4 text-xs text-gray-600">
                    Source: <a href="https://www.nyc.gov/site/doh/health/health-topics/mpox.page" target="_blank" rel="noreferrer" className="brand-blue hover:underline">NYC Health mpox case data</a>; chart by D²Sci. X-axis: calendar month and day; each line represents the labeled year. The current-year line ends at the latest available data date.
                  </figcaption>
                </figure>
              ) : (
                <div className="h-[380px] flex items-center justify-center text-gray-400 text-sm">
                  {error ? "Chart unavailable" : "Loading…"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {data && (
        <div className="mx-auto max-w-6xl px-4 pb-8">
          <div className="flex items-center gap-3 rounded-md border border-brand-gray/30 bg-white px-4 py-3">
            <Switch
              id="line-patterns"
              checked={useLinePatterns}
              onCheckedChange={setUseLinePatterns}
              aria-describedby="line-patterns-description"
              className="data-[state=checked]:bg-brand-navy"
            />
            <div>
              <label htmlFor="line-patterns" className="cursor-pointer text-sm font-semibold brand-navy">
                Use line patterns
              </label>
              <p id="line-patterns-description" className="text-xs text-gray-600">
                Add dashes and dots to distinguish lines without relying on color. Applies to all charts.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Method */}
      <section id="method" className="py-16 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="brand-navy mb-4">Method</h2>
          <p className="text-gray-700 mb-4 leading-relaxed">
            This unofficial tracker fetches public NYC Health mpox case data.
            Its weekly growth trend fits eight consecutive seven-day case
            totals on a log(1 + cases) scale. The chart updates the fit daily
            where cases are reported daily and weekly where only weekly totals
            exist. Weekly
            totals are distributed across reporting days only for the
            daily-equivalent and cumulative case views, not for the current
            growth trend.
          </p>
          <p className="text-gray-700 mb-8 leading-relaxed">
            It is intended for situational awareness, not clinical or
            individual medical guidance. Follow NYC Health guidance for
            prevention, testing, vaccination, and treatment decisions.
          </p>

          {data && (
            <div className="grid md:grid-cols-3 gap-4 mb-8">
              <div className="rounded-md bg-white border border-brand-gray/30 p-4">
                <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                  Smoothing window
                </div>
                <div className="brand-navy font-semibold">
                  {data.parameters.smoothing_window_days} days
                </div>
              </div>
              <div className="rounded-md bg-white border border-brand-gray/30 p-4">
                <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                  Gaussian σ
                </div>
                <div className="brand-navy font-semibold">
                  {data.parameters.smoothing_std_days} days
                </div>
              </div>
              <div className="rounded-md bg-white border border-brand-gray/30 p-4">
                <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                  Risk normalization
                </div>
                <div className="brand-navy font-semibold">
                  {data.parameters.risk_normalization_factor}
                </div>
              </div>
            </div>
          )}

          {data && (
            <div>
              <h3 className="brand-navy mb-3">Data sources</h3>
              <dl className="space-y-3">
                {data.sources.map((s) => (
                  <div
                    key={s.url}
                    className="rounded-md bg-white border border-brand-gray/30 p-4"
                  >
                    <dt className="brand-navy font-semibold mb-1">{s.name}</dt>
                    <dd className="text-sm text-gray-600 break-words">
                      {s.rows.toLocaleString()} rows fetched from{" "}
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="brand-blue hover:underline"
                      >
                        {s.url}
                      </a>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </section>

      {/* How it works (D2Sci framing cards) */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="brand-navy mb-4">How the Tracker Works</h2>
            <p className="text-gray-700 max-w-3xl mx-auto">
              Built with the same analytical rigor D²Sci applies to client
              engagements — and made publicly available as a community
              resource.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {cards.map((c, i) => (
              <Card key={i} className="h-full hover:shadow-lg transition-shadow">
                <CardContent className="p-6 text-center">
                  <div className="mb-4 flex justify-center">{c.icon}</div>
                  <h3 className="brand-navy mb-3">{c.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {c.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Resources */}
      <section id="resources" className="py-16 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h2 className="brand-navy mb-2">Mpox Health Resources</h2>
            <p className="text-gray-700">
              Respectful public health information, with LGBTQ+
              community-centered sources first.
            </p>
          </div>
          <ul className="space-y-3">
            {RESOURCES.map((r) => (
              <li key={r.href}>
                <a
                  href={r.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md bg-white border border-brand-gray/30 p-4 hover:shadow-md transition-shadow group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="brand-navy font-semibold group-hover:brand-blue transition-colors">
                      {r.title}
                    </span>
                    <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-brand-blue transition-colors" />
                  </div>
                  <span className="text-sm text-gray-600">{r.desc}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 px-4 bg-brand-navy text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="mb-4">Want the standalone view?</h2>
          <p className="text-xl mb-8 opacity-90">
            The full tracker is also hosted as a self-contained page with the
            same data and methodology.
          </p>
          <Button
            size="lg"
            className="bg-brand-teal hover:bg-brand-teal/90"
            onClick={() => window.open(TRACKER_URL, "_blank")}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open Standalone Tracker
          </Button>
        </div>
      </section>
    </div>
  );
}

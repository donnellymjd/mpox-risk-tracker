import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
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
import { Card, CardContent } from "./ui/card";
import {
  ShieldCheck,
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
}

type StoplightColor = "green" | "amber" | "red";
type StoplightKey = "level" | "momentum" | "yearOverYear";

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

function validCaseStoplight(value: CaseStoplight | undefined): value is CaseStoplight {
  if (!value || value.version !== 1 || typeof value.as_of !== "string" ||
      typeof value.four_weeks_ago_date !== "string" || !Array.isArray(value.rows) || value.rows.length !== 3) return false;
  const ageDays = (Date.now() - Date.parse(`${value.as_of}T00:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < 0 || ageDays > 14) return false;
  const colors = new Set(["green", "amber", "red"]);
  return value.rows.every((row) => row && typeof row.key === "string" && typeof row.name === "string" &&
    typeof row.rule === "string" && typeof row.changed_at === "string" &&
    row.reading && colors.has(row.reading.color) && typeof row.reading.value === "string" &&
    row.four_weeks_ago && colors.has(row.four_weeks_ago.color) && typeof row.four_weeks_ago.value === "string");
}

function StoplightTable({ data }: { data: TrackerData }) {
  const stoplight = data.case_stoplight;
  if (!validCaseStoplight(stoplight)) return (
    <div className="rounded-lg border border-brand-gray/30 bg-white p-4 sm:p-6">
      <h2 id="case-stoplight-heading" className="brand-navy mb-2">NYC Mpox Case Activity Stoplight</h2>
      <p className="text-sm text-gray-600">{typeof stoplight?.unavailable_reason === "string" ? stoplight.unavailable_reason : "Awaiting current, compatible stoplight data from the upstream tracker."}</p>
    </div>
  );
  const rows = stoplight.rows;
  const fourWeeksAgoDate = stoplight.four_weeks_ago_date;

  return (
    <div>
      <div className="rounded-lg border border-brand-gray/30 bg-white">
        <div className="border-b border-brand-gray/20 p-4 sm:p-6">
          <h2 id="case-stoplight-heading" className="brand-navy mb-2">NYC Mpox Case Activity Stoplight</h2>
          <p className="text-sm text-gray-700">
            Reported weekly cases through {fmtDate(`${stoplight.as_of}T00:00:00Z`)}. Three views of case activity: recent level, recent direction, and comparison with last year. Higher case counts are unfavorable.
          </p>
          <p className="mt-2 text-xs text-gray-600">
            Source: <a href={stoplight.source_url ?? "https://www.nyc.gov/site/doh/health/health-topics/mpox.page"} target="_blank" rel="noreferrer" className="brand-blue hover:underline">NYC Health weekly mpox cases</a>; stoplight calculations by D²Sci in the upstream tracker. Open Why? for the rule and last color change.
          </p>
          <p className="mt-1 text-xs text-gray-600 sm:hidden">Scroll the table sideways for the comparison and details.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-brand-gray/20 text-gray-700">
            <tr>
              <th scope="col" className="p-4 font-semibold">Dimension</th>
              <th scope="col" className="p-4 font-semibold">Stoplight</th>
              <th scope="col" className="p-4 font-semibold">Latest</th>
              <th scope="col" className="p-4 font-semibold">Four weeks ago <span className="block text-xs font-normal">Week ending {fmtDate(`${fourWeeksAgoDate}T00:00:00Z`)}</span></th>
              <th scope="col" className="p-4 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-brand-gray/20 align-top">
                <th scope="row" className="p-4 brand-navy font-semibold">{row.name}</th>
                <td className="p-4">
                  <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-2.5 py-1 font-semibold ${STOPLIGHT_COLORS[row.reading.color].className}`}>
                    <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
                    {STOPLIGHT_COLORS[row.reading.color].label}
                  </span>
                </td>
                <td className="p-4 font-medium text-gray-900">{row.reading.value}</td>
                <td className="p-4 text-gray-700">
                  {row.four_weeks_ago.value}
                  <span className="block text-xs text-gray-500">{STOPLIGHT_COLORS[row.four_weeks_ago.color].label} then</span>
                </td>
                <td className="p-4">
                  <details className="group">
                    <summary className="inline-flex cursor-pointer items-center gap-1 brand-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                      <Info className="h-4 w-4" aria-hidden="true" /> Why?
                    </summary>
                    <div className="mt-2 w-64 text-xs leading-relaxed text-gray-700">
                      <p>{row.rule}</p>
                      <p className="mt-2">Current color since the week ending {fmtDate(`${row.changed_at}T00:00:00Z`)}.</p>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
        <p className="border-t border-brand-gray/20 px-4 py-3 text-xs text-gray-600 sm:px-6">
          Colors are descriptive monitoring rules, not calibrated probabilities or personal medical risk. The separate growth-index band measures a shorter-term signal.
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

function monthIndexFromDate(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return new Date().getUTCMonth();
  return date.getUTCMonth();
}

function defaultMonthRange(data: TrackerData): MonthRange {
  const monthIndex = monthIndexFromDate(data.latest_data_date);
  return {
    startMonthIndex: Math.max(0, monthIndex - 1),
    endMonthIndex: Math.min(MONTH_TICKS.length - 1, monthIndex + 1),
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
  field: "risk_index" | "cumulative_cases",
  monthRange: MonthRange,
) {
  const wanted = new Set(years);
  const range = dayRange(monthRange);
  const byDay = new Map<number, any>();
  data.series.forEach((row) => {
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
    byDay.get(row.day_index)![`cases${row.year}`] = row.cases;
  });
  return Array.from(byDay.values()).sort((a, b) => a.day_index - b.day_index);
}

function ChartTooltip({ active, payload, data, field }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const first = payload[0]?.payload;
  if (!first) return null;
  const formatter = (v: number | null | undefined) =>
    v === null || v === undefined
      ? "--"
      : field === "risk_index"
        ? v.toFixed(2)
        : v.toLocaleString();
  return (
    <div className="bg-white border border-brand-gray/40 rounded-md shadow-md px-3 py-2 text-xs">
      <div className="font-semibold brand-navy mb-1">{first.month_day}</div>
      {payload
        .slice()
        .sort((a: any, b: any) => Number(b.name) - Number(a.name))
        .map((p: any) => {
          const year = Number(p.name);
          const cases = first[`cases${year}`];
          return (
            <div key={p.name} className="flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ background: p.color }}
              />
              <span className="brand-navy">{year}:</span>
              <span className="font-medium">{formatter(p.value)}</span>
              <span className="text-gray-500">
                ({cases === null || cases === undefined ? "--" : cases} cases)
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

function TrackerChart({
  data,
  styling,
  selectedYears,
  monthRange,
  field,
  showRiskBands,
  yLabel,
}: {
  data: TrackerData;
  styling: Styling;
  selectedYears: number[];
  monthRange: MonthRange;
  field: "risk_index" | "cumulative_cases";
  showRiskBands?: boolean;
  yLabel: string;
}) {
  const chartData = useMemo(
    () => buildChartData(data, selectedYears, field, monthRange),
    [data, selectedYears, field, monthRange],
  );

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

  const yTicks = niceTicks(yMin, yMax, 6);
  yMin = yTicks[0];
  yMax = yTicks[yTicks.length - 1];
  const tickStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1;
  const tickDecimals = tickStep >= 1 ? 0 : tickStep >= 0.1 ? 1 : 2;
  const range = dayRange(monthRange);

  const latest = data.series.find(
    (r) => r.year === data.current_year && r.date === data.latest_data_date,
  );

  const bands = showRiskBands ? styling.riskBands : [];

  return (
    <div className="w-full">
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
                fill={styling.bandStyles[band.label]?.bg ?? FALLBACK_BAND_BG}
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
            content={<ChartTooltip data={data} field={field} />}
            cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }}
          />
          <Legend
            key="legend"
            verticalAlign="bottom"
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          />
          {latest &&
            selectedYears.includes(data.current_year) &&
            latest.day_index >= range.start &&
            latest.day_index <= range.end && (
            <ReferenceLine
              id="latest-data-marker"
              x={latest.day_index}
              stroke="#0f172a"
              strokeDasharray="4 4"
              label={{
                value: `Latest data ${latest.month_day}`,
                position: "top",
                fill: "#0f172a",
                fontSize: 11,
              }}
            />
          )}
          {selectedYears.map((year) => (
            <Line
              key={year}
              id={`line-${year}`}
              type="monotone"
              dataKey={`y${year}`}
              name={String(year)}
              stroke={styling.yearColors[String(year)] ?? FALLBACK_YEAR_COLOR}
              strokeWidth={year === data.current_year ? 2.8 : 1.6}
              strokeOpacity={year === data.current_year ? 1 : 0.8}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      </div>
      <ChartMark />
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
        const targets = [2022, currentYear - 1, currentYear];
        const defaults = targets.filter((y) => years.includes(y));
        setSelectedYears(new Set(defaults.length ? defaults : years.slice(-3)));
        setMonthRange(defaultMonthRange(d));
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

  const styling = useMemo(() => mergeStyling(data?.styling), [data?.styling]);

  const band = data?.summary.risk_band || (error ? "Unavailable" : "Loading");
  const bandBg = styling.bandStyles[band]?.bg ?? FALLBACK_BAND_BG;
  const bandText = styling.bandStyles[band]?.text ?? FALLBACK_BAND_TEXT;

  const cards = [
    {
      icon: <Activity className="h-8 w-8 brand-blue" />,
      title: "Current signal",
      description:
        "A clear, at-a-glance read of NYC mpox spread risk derived from the latest case reporting — refreshed automatically so the snapshot always reflects current conditions.",
    },
    {
      icon: <History className="h-8 w-8 brand-teal" />,
      title: "Historical context",
      description:
        "Comparisons against prior outbreak periods help frame whether today's signal is elevated, normal, or trending — turning raw counts into informed perspective.",
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
      <Helmet>
        <title>Public Data Tools | D2Sci</title>
        <meta
          name="description"
          content="A D2Sci public data tool that turns NYC mpox case reporting into a regularly refreshed spread-risk signal, historical comparisons, and links to respected health resources."
        />
      </Helmet>

      {/* Hero */}
      <section className="bg-gradient-navy-to-orange text-white py-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-brand-navy/70"></div>
        <div className="max-w-5xl mx-auto text-center relative">
          <ShieldCheck className="h-14 w-14 mx-auto mb-6 brand-teal" />
          <p className="text-sm uppercase tracking-wider opacity-80 mb-3">
            Public Analytics / Health Signal Monitoring
          </p>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            NYC Mpox Spread Risk Tracker
          </h1>
          <p className="text-lg md:text-xl mb-8 max-w-3xl mx-auto opacity-90">
            A D²Sci public data tool that turns NYC mpox case reporting into a
            regularly refreshed spread-risk signal, historical comparisons, and
            links to respected health resources.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="bg-brand-teal hover:bg-brand-teal/90 text-white"
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
              className="bg-transparent border-white text-white hover:bg-white hover:text-brand-navy"
              onClick={() => window.open(REPO_URL, "_blank")}
            >
              <Github className="h-4 w-4 mr-2" />
              View Methodology
            </Button>
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
                Growth-index band
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
                Risk index
              </div>
              <div className="text-2xl font-bold brand-navy">
                {data?.summary.risk_index !== null &&
                data?.summary.risk_index !== undefined
                  ? data.summary.risk_index.toFixed(2)
                  : "--"}
              </div>
            </div>
            <div className="rounded-lg p-5 bg-brand-gray/20 border border-brand-gray/30">
              <div className="text-xs uppercase tracking-wide text-gray-700 mb-1">
                Cases, last 28 days
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
        <div className="max-w-6xl mx-auto">
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

      {/* Case Growth Indicator chart */}
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
              <h2 id="growth-chart-heading" className="brand-navy mb-2">NYC Mpox Case Growth Indicator by Calendar Date</h2>
              <p className="text-sm text-gray-700 mb-2">
                Unitless index of the day-to-day change in smoothed reported cases. Above zero means rising; below zero means falling. Colored bands describe growth, not individual infection risk.
              </p>
          <p className="text-xs text-gray-600 mb-5">
                {data ? `Source: NYC Health · Years shown: ${selectedYearsArray.length ? selectedYearsArray.join(", ") : "none"} · Months shown: ${MONTH_TICKS[monthRange.startMonthIndex].label}–${MONTH_TICKS[monthRange.endMonthIndex].label} · Latest source week ending ${fmtDate(`${data.latest_data_date}T00:00:00Z`)}` : "Loading source data…"}
              </p>
              {data ? (
                <figure aria-labelledby="growth-chart-heading">
                  <TrackerChart
                    data={data}
                    styling={styling}
                    selectedYears={selectedYearsArray}
                    monthRange={monthRange}
                    field="risk_index"
                    showRiskBands
                    yLabel="Case growth index (unitless)"
                  />
                  <div className="flex flex-wrap gap-2 mt-4 justify-center">
                    {styling.riskBands.map((b) => (
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
                    Source: <a href="https://www.nyc.gov/site/doh/health/health-topics/mpox.page" target="_blank" rel="noreferrer" className="brand-blue hover:underline">NYC Health mpox case data</a>; indicator by D²Sci. Recent weekly totals are spread evenly across reporting days before smoothing. X-axis: calendar month and day; each line represents the labeled year.
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

      {/* Method */}
      <section id="method" className="py-16 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="brand-navy mb-4">Method</h2>
          <p className="text-gray-700 mb-4 leading-relaxed">
            This unofficial tracker fetches public NYC Health mpox case data,
            smooths daily-equivalent cases with a 14-day Gaussian window, and
            converts the day-to-day change in smoothed log cases into a
            normalized spread indicator. Weekly case counts are distributed
            across their reporting week before smoothing.
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

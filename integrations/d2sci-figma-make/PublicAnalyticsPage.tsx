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
} from "lucide-react";

const TRACKER_URL = "https://donnellymjd.github.io/mpox-risk-tracker/";
const DATA_URL =
  "https://donnellymjd.github.io/mpox-risk-tracker/data/risk_data.json";
const REPO_URL = "https://github.com/donnellymjd/mpox-risk-tracker";

const DEFAULT_STYLING: TrackerStyling = {
  yearColors: {
    "2022": "#1e4976",
    "2023": "#e8833a",
    "2024": "#009e73",
    "2025": "#6f4aa0",
    "2026": "#d55e00",
    "2027": "#0072b2",
  },
  riskBands: [
    { label: "Very Low", min: null, max: 0.0, color: "#e6f0f5" },
    { label: "Low", min: 0.0, max: 0.5, color: "#d8e8df" },
    { label: "Moderate", min: 0.5, max: 1.0, color: "#fff0bf" },
    { label: "Moderate-High", min: 1.0, max: 1.5, color: "#fbd1a7" },
    { label: "High", min: 1.5, max: null, color: "#f3b7b2" },
  ],
  version: 1,
};

const BAND_TEXT: Record<string, string> = {
  "Very Low": "#1e4976",
  Low: "#256d4a",
  Moderate: "#8a6300",
  "Moderate-High": "#a04a14",
  High: "#9a2f29",
};

const MONTHS = [
  { label: "Jan", start: 1, end: 31 },
  { label: "Feb", start: 32, end: 59 },
  { label: "Mar", start: 60, end: 90 },
  { label: "Apr", start: 91, end: 120 },
  { label: "May", start: 121, end: 151 },
  { label: "Jun", start: 152, end: 181 },
  { label: "Jul", start: 182, end: 212 },
  { label: "Aug", start: 213, end: 243 },
  { label: "Sep", start: 244, end: 273 },
  { label: "Oct", start: 274, end: 304 },
  { label: "Nov", start: 305, end: 334 },
  { label: "Dec", start: 335, end: 365 },
];

const FIRST_VISIBLE_DAY_BY_YEAR: Record<number, number> = {
  2022: 138,
};

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
  color?: string;
}

interface TrackerStyling {
  yearColors: Record<string, string>;
  riskBands: Required<RiskBand>[];
  version: number;
}

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
  styling?: unknown;
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
  notes?: string[];
}

interface MonthRange {
  startMonthIndex: number;
  endMonthIndex: number;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
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

function validateStyling(styling: unknown): TrackerStyling | null {
  if (
    !isPlainObject(styling) ||
    !isPlainObject(styling.yearColors) ||
    !Array.isArray(styling.riskBands)
  ) {
    return null;
  }

  const yearColors: Record<string, string> = {};
  for (const [year, color] of Object.entries(styling.yearColors)) {
    if (!/^\d{4}$/.test(year) || !isHexColor(color)) return null;
    yearColors[year] = color;
  }

  if (Object.keys(yearColors).length === 0 || styling.riskBands.length === 0) {
    return null;
  }

  const riskBands = styling.riskBands.map((band) => {
    if (
      !isPlainObject(band) ||
      typeof band.label !== "string" ||
      !("min" in band) ||
      !("max" in band) ||
      !isNullableNumber(band.min) ||
      !isNullableNumber(band.max) ||
      !isHexColor(band.color)
    ) {
      return null;
    }
    return {
      label: band.label,
      min: band.min,
      max: band.max,
      color: band.color,
    };
  });

  if (riskBands.some((band) => band === null)) return null;

  return {
    yearColors,
    riskBands: riskBands as Required<RiskBand>[],
    version:
      typeof styling.version === "number" && Number.isInteger(styling.version)
        ? styling.version
        : DEFAULT_STYLING.version,
  };
}

function resolveStyling(data: TrackerData): TrackerStyling {
  if (!data.styling) {
    console.warn("risk_data.json is missing styling; using built-in chart defaults.");
    return DEFAULT_STYLING;
  }

  const styling = validateStyling(data.styling);
  if (!styling) {
    console.warn("risk_data.json styling is malformed; using built-in chart defaults.");
    return DEFAULT_STYLING;
  }
  return styling;
}

function availableYears(data: TrackerData) {
  return Array.from(new Set(data.series.map((s) => s.year))).sort((a, b) => a - b);
}

function defaultYears(data: TrackerData) {
  const years = availableYears(data);
  const wanted = [2022, data.current_year - 1, data.current_year];
  const defaults = wanted.filter(
    (year, index) => wanted.indexOf(year) === index && years.includes(year),
  );
  return defaults.length > 0 ? defaults : years.slice(-3);
}

function monthIndexFromDate(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return new Date().getUTCMonth();
  return date.getUTCMonth();
}

function defaultMonthRange(data: TrackerData): MonthRange {
  const monthIndex = monthIndexFromDate(data.latest_data_date);
  return {
    startMonthIndex: Math.max(0, monthIndex - 1),
    endMonthIndex: Math.min(MONTHS.length - 1, monthIndex + 1),
  };
}

function dayRange(monthRange: MonthRange) {
  return {
    start: MONTHS[monthRange.startMonthIndex].start,
    end: MONTHS[monthRange.endMonthIndex].end,
  };
}

function isVisibleRow(row: SeriesRow, range: { start: number; end: number }) {
  const firstVisibleDay = FIRST_VISIBLE_DAY_BY_YEAR[row.year] || 1;
  return row.day_index >= Math.max(range.start, firstVisibleDay) && row.day_index <= range.end;
}

function buildChartData(
  data: TrackerData,
  years: number[],
  field: "risk_index" | "cumulative_cases",
  monthRange: MonthRange,
) {
  const wanted = new Set(years);
  const range = dayRange(monthRange);
  const byDay = new Map<number, Record<string, unknown>>();

  data.series.forEach((row) => {
    if (!wanted.has(row.year) || !isVisibleRow(row, range)) return;
    if (!byDay.has(row.day_index)) {
      byDay.set(row.day_index, {
        day_index: row.day_index,
        month_day: row.month_day,
      });
    }
    byDay.get(row.day_index)![`y${row.year}`] = row[field];
    byDay.get(row.day_index)![`cases${row.year}`] = row.cases;
  });

  return Array.from(byDay.values()).sort(
    (a, b) => Number(a.day_index) - Number(b.day_index),
  );
}

function ChartTooltip({ active, payload, field }: any) {
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
  selectedYears,
  field,
  styling,
  monthRange,
  showRiskBands,
  yLabel,
}: {
  data: TrackerData;
  selectedYears: number[];
  field: "risk_index" | "cumulative_cases";
  styling: TrackerStyling;
  monthRange: MonthRange;
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
    yMax = Math.max(yMax, 4);
  }

  const niceTicks = (min: number, max: number, target = 6) => {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
    const span = max - min;
    const rawStep = span / Math.max(1, target - 1);
    const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const candidates = [1, 2, 2.5, 5, 10];
    const step = (candidates.find((c) => c * pow >= rawStep) || 10) * pow;
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
            {showRiskBands &&
              styling.riskBands.map((band, i) => {
                const from = band.min ?? yMin;
                const to = band.max ?? yMax;
                if (to <= yMin || from >= yMax) return null;
                return (
                  <ReferenceArea
                    key={`band-${band.label}-${i}`}
                    id={`band-${band.label}-${i}`}
                    y1={Math.max(from, yMin)}
                    y2={Math.min(to, yMax)}
                    fill={band.color}
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
              ticks={MONTHS.filter((m) => m.start >= range.start && m.start <= range.end).map((m) => m.start)}
              tickFormatter={(d) => MONTHS.find((m) => m.start === d)?.label || ""}
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
              content={<ChartTooltip field={field} />}
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
                />
              )}
            {selectedYears.map((year) => (
              <Line
                key={year}
                id={`line-${year}`}
                type="monotone"
                dataKey={`y${year}`}
                name={String(year)}
                stroke={styling.yearColors[String(year)] || "#2f665f"}
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
  styling,
  onToggle,
}: {
  years: number[];
  selected: Set<number>;
  styling: TrackerStyling;
  onToggle: (y: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {years.map((y) => {
        const active = selected.has(y);
        const color = styling.yearColors[String(y)] || "#2f665f";
        return (
          <button
            key={y}
            onClick={() => onToggle(y)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              active
                ? "text-white border-transparent"
                : "bg-white border-brand-gray/40 text-brand-navy hover:bg-brand-gray/20"
            }`}
            style={active ? { backgroundColor: color } : undefined}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle"
              style={{ background: color }}
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
        {MONTHS.map((month, index) => (
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
        {MONTHS.map((month, index) => (
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
  const [styling, setStyling] = useState<TrackerStyling>(DEFAULT_STYLING);
  const [error, setError] = useState<string | null>(null);
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  const [monthRange, setMonthRange] = useState<MonthRange>({
    startMonthIndex: 0,
    endMonthIndex: MONTHS.length - 1,
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
        setStyling(resolveStyling(d));
        setSelectedYears(new Set(defaultYears(d)));
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

  const years = useMemo(() => (data ? availableYears(data) : []), [data]);
  const selectedYearsArray = useMemo(
    () => Array.from(selectedYears).sort((a, b) => a - b),
    [selectedYears],
  );
  const toggleYear = (y: number) => {
    setSelectedYears((prev) => {
      const next = new Set(prev);
      if (next.has(y)) next.delete(y);
      else next.add(y);
      return next;
    });
  };

  const band = data?.summary.risk_band || (error ? "Unavailable" : "Loading");
  const bandColor =
    styling.riskBands.find((riskBand) => riskBand.label === band)?.color || "#e5e7eb";
  const bandText = BAND_TEXT[band] || "#475569";

  const cards = [
    {
      icon: <Activity className="h-8 w-8 brand-blue" />,
      title: "Current signal",
      description:
        "A clear read of NYC mpox spread risk derived from the latest case reporting.",
    },
    {
      icon: <History className="h-8 w-8 brand-teal" />,
      title: "Historical context",
      description:
        "Comparisons against prior outbreak periods help frame whether today's signal is elevated, normal, or trending.",
    },
    {
      icon: <RefreshCw className="h-8 w-8 brand-blue" />,
      title: "Automated updates",
      description:
        "The tracker pulls from official NYC sources on a scheduled cadence.",
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

      <section className="py-12 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          {error && (
            <div className="mb-6 flex items-start gap-3 p-4 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-sm">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Live data unavailable.</strong> Try the{" "}
                <a href={TRACKER_URL} className="underline" target="_blank" rel="noreferrer">
                  full tracker
                </a>
                .
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg p-5 border" style={{ background: bandColor }}>
              <div className="text-xs uppercase tracking-wide text-gray-700 mb-1">
                Current status
              </div>
              <div className="text-2xl font-bold" style={{ color: bandText }}>
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

      <section id="indicator" className="py-12 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
            <div>
              <h2 className="brand-navy mb-2">Spread Risk Indicator</h2>
              <p className="text-gray-700 text-sm">
                Positive values indicate accelerating reported cases after smoothing.
              </p>
            </div>
            {data && (
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <YearToggles
                  years={years}
                  selected={selectedYears}
                  styling={styling}
                  onToggle={toggleYear}
                />
                <MonthControls value={monthRange} onChange={setMonthRange} />
              </div>
            )}
          </div>
          <Card>
            <CardContent className="p-4 sm:p-6">
              {data ? (
                <>
                  <TrackerChart
                    data={data}
                    selectedYears={selectedYearsArray}
                    field="risk_index"
                    styling={styling}
                    monthRange={monthRange}
                    showRiskBands
                    yLabel="Risk index"
                  />
                  <div className="flex flex-wrap gap-2 mt-4 justify-center">
                    {styling.riskBands.map((b) => (
                      <span
                        key={b.label}
                        className="text-xs px-2 py-1 rounded-md border"
                        style={{
                          background: b.color,
                          color: BAND_TEXT[b.label] || "#475569",
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
                </>
              ) : (
                <div className="h-[380px] flex items-center justify-center text-gray-400 text-sm">
                  {error ? "Chart unavailable" : "Loading..."}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="py-12 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h2 className="brand-navy mb-2">Cumulative Cases</h2>
            <p className="text-gray-700 text-sm">
              Year-to-date case totals, aligned by month and day.
            </p>
          </div>
          <Card>
            <CardContent className="p-4 sm:p-6">
              {data ? (
                <TrackerChart
                  data={data}
                  selectedYears={selectedYearsArray}
                  field="cumulative_cases"
                  styling={styling}
                  monthRange={monthRange}
                  yLabel="Cases"
                />
              ) : (
                <div className="h-[380px] flex items-center justify-center text-gray-400 text-sm">
                  {error ? "Chart unavailable" : "Loading..."}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

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
            It is intended for situational awareness, not clinical or individual
            medical guidance. Follow NYC Health guidance for prevention, testing,
            vaccination, and treatment decisions.
          </p>
        </div>
      </section>

      <section className="py-16 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="brand-navy mb-4">How the Tracker Works</h2>
            <p className="text-gray-700 max-w-3xl mx-auto">
              Built with the same analytical rigor D²Sci applies to client
              engagements and made publicly available as a community resource.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {cards.map((c) => (
              <Card key={c.title} className="h-full hover:shadow-lg transition-shadow">
                <CardContent className="p-6 text-center">
                  <div className="mb-4 flex justify-center">{c.icon}</div>
                  <h3 className="brand-navy mb-3">{c.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{c.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="resources" className="py-16 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h2 className="brand-navy mb-2">Mpox Health Resources</h2>
            <p className="text-gray-700">
              Respectful public health information, with LGBTQ+ community-centered
              sources first.
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

      <section className="py-16 px-4 bg-brand-navy text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="mb-4">Want the standalone view?</h2>
          <p className="text-xl mb-8 opacity-90">
            The full tracker is also hosted as a self-contained page with the same
            data and methodology.
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

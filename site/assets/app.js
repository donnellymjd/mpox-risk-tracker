const DEFAULT_STYLING = {
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
  version: 1,
};

const monthTicks = [
  ["Jan", 1],
  ["Feb", 32],
  ["Mar", 60],
  ["Apr", 91],
  ["May", 121],
  ["Jun", 152],
  ["Jul", 182],
  ["Aug", 213],
  ["Sep", 244],
  ["Oct", 274],
  ["Nov", 305],
  ["Dec", 335],
];

const monthOptions = [
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

const firstVisibleDayByYear = {
  2022: 138,
};

const fmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const compact = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});
const percentage = { format: (value) => `${value > 0 ? "+" : ""}${compact.format(value)}%` };

const YEAR_LINE_PATTERNS = [
  { dash: null, label: "solid" },
  { dash: "10 4", label: "long dash" },
  { dash: "4 3", label: "short dash" },
  { dash: "10 3 2 3", label: "dash-dot" },
  { dash: "2 3", label: "dotted" },
  { dash: "14 3 3 3", label: "long-short dash" },
];

function linePatternForYear(year) {
  const index = ((Number(year) - 2022) % YEAR_LINE_PATTERNS.length + YEAR_LINE_PATTERNS.length) % YEAR_LINE_PATTERNS.length;
  return YEAR_LINE_PATTERNS[index];
}

const precise = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

let trackerData = null;
let selectedYears = new Set();
let selectedMonthRange = { startMonthIndex: 0, endMonthIndex: monthOptions.length - 1 };
let activeStyling = DEFAULT_STYLING;

function byId(id) {
  return document.getElementById(id);
}

function valueText(value, fallback = "--", formatter = compact) {
  return value === null || value === undefined ? fallback : formatter.format(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function isNullableNumber(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function defaultRiskBandTextColor(label) {
  return DEFAULT_STYLING.riskBands.find((band) => band.label === label)?.textColor || "#475569";
}

function validateStyling(styling) {
  if (!isPlainObject(styling) || !isPlainObject(styling.yearColors) || !Array.isArray(styling.riskBands)) {
    return null;
  }

  const yearColors = {};
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
    const textColor = "textColor" in band ? band.textColor : defaultRiskBandTextColor(band.label);
    if (!isHexColor(textColor)) {
      return null;
    }
    return {
      label: band.label,
      min: band.min,
      max: band.max,
      color: band.color,
      textColor,
    };
  });

  if (riskBands.some((band) => band === null)) return null;

  return {
    yearColors,
    riskBands,
    version: Number.isInteger(styling.version) ? styling.version : DEFAULT_STYLING.version,
  };
}

function resolveStyling(data) {
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

function colorForYear(year) {
  return activeStyling.yearColors[String(year)] || "#2f665f";
}

function availableYears(data) {
  return [...new Set(data.series.map((row) => row.year))].sort((a, b) => a - b);
}

function defaultYears(data) {
  const years = availableYears(data);
  const wanted = [data.current_year - 1, data.current_year];
  const defaults = wanted.filter((year, index) => wanted.indexOf(year) === index && years.includes(year));
  return defaults.length > 0 ? defaults : years.slice(-3);
}

function defaultMonthRange() {
  return {
    startMonthIndex: 0,
    endMonthIndex: new Date().getMonth(),
  };
}

function visibleDayRange() {
  return {
    start: monthOptions[selectedMonthRange.startMonthIndex].start,
    end: monthOptions[selectedMonthRange.endMonthIndex].end,
  };
}

function isVisibleRow(row, dayRange) {
  const firstVisibleDay = firstVisibleDayByYear[row.year] || 1;
  return row.day_index >= Math.max(dayRange.start, firstVisibleDay) && row.day_index <= dayRange.end;
}

function groupByYear(rows, years, dayRange) {
  const wanted = new Set(years);
  return rows.reduce((acc, row) => {
    if (!wanted.has(row.year)) return acc;
    if (!isVisibleRow(row, dayRange)) return acc;
    if (!acc[row.year]) acc[row.year] = [];
    acc[row.year].push(row);
    return acc;
  }, {});
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function niceTicks(min, max, count = 5) {
  if (min === max) return [min];
  const span = max - min;
  const rawStep = span / Math.max(1, count - 1);
  const power = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 5, 10].find((candidate) => candidate * power >= rawStep) * power;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Number(value.toFixed(8)));
  }
  return ticks;
}

function linePath(rows, xScale, yScale, field) {
  const parts = [];
  let open = false;
  rows.forEach((row) => {
    const value = row[field];
    if (value === null || value === undefined || Number.isNaN(value)) {
      open = false;
      return;
    }
    const command = open ? "L" : "M";
    parts.push(`${command}${xScale(row.day_index).toFixed(2)},${yScale(value).toFixed(2)}`);
    open = true;
  });
  return parts.join(" ");
}

function drawLegend(target, years, currentYear, frequencyByYear = {}) {
  const legend = byId(target);
  clear(legend);
  years.forEach((year) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    const swatch = svgEl("svg", { width: 34, height: 12, "aria-hidden": "true", class: "legend-line-swatch" });
    const pattern = linePatternForYear(year);
    swatch.append(svgEl("line", { x1: 1, x2: 33, y1: 6, y2: 6, stroke: colorForYear(year), "stroke-width": year === currentYear ? 3.4 : 2.5, "stroke-dasharray": pattern.dash ?? "none", "stroke-linecap": "round" }));
    item.setAttribute("aria-label", `${year}, ${pattern.label} line${frequencyByYear[year] ? `, ${frequencyByYear[year]} source` : ""}`);
    item.append(swatch, document.createTextNode(`${year}${frequencyByYear[year] ? ` · ${frequencyByYear[year]}` : ""}`));
    legend.append(item);
  });
}

function setupYearControls(data) {
  const controls = byId("yearControls");
  clear(controls);

  availableYears(data).forEach((year) => {
    const label = document.createElement("label");
    label.className = "year-toggle";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = String(year);
    input.checked = selectedYears.has(year);
    input.addEventListener("change", () => {
      if (input.checked) {
        selectedYears.add(year);
      } else {
        selectedYears.delete(year);
      }
      render();
    });

    const swatch = document.createElement("span");
    swatch.className = "year-toggle-swatch";
    swatch.style.background = colorForYear(year);

    label.append(input, swatch, document.createTextNode(String(year)));
    controls.append(label);
  });
}

function setupMonthControls() {
  const controls = byId("monthControls");
  clear(controls);

  const title = document.createElement("span");
  title.className = "month-controls-label";
  title.textContent = "Zoom";

  const startSelect = document.createElement("select");
  startSelect.setAttribute("aria-label", "Start month");

  const endSelect = document.createElement("select");
  endSelect.setAttribute("aria-label", "End month");

  monthOptions.forEach((month, index) => {
    const startOption = document.createElement("option");
    startOption.value = String(index);
    startOption.textContent = month.label;
    startOption.selected = index === selectedMonthRange.startMonthIndex;
    startSelect.append(startOption);

    const endOption = document.createElement("option");
    endOption.value = String(index);
    endOption.textContent = month.label;
    endOption.selected = index === selectedMonthRange.endMonthIndex;
    endSelect.append(endOption);
  });

  startSelect.addEventListener("change", () => {
    const nextStart = Number(startSelect.value);
    selectedMonthRange.startMonthIndex = nextStart;
    if (selectedMonthRange.endMonthIndex < nextStart) {
      selectedMonthRange.endMonthIndex = nextStart;
    }
    render();
  });

  endSelect.addEventListener("change", () => {
    const nextEnd = Number(endSelect.value);
    selectedMonthRange.endMonthIndex = nextEnd;
    if (selectedMonthRange.startMonthIndex > nextEnd) {
      selectedMonthRange.startMonthIndex = nextEnd;
    }
    render();
  });

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "month-reset";
  reset.textContent = "Full year";
  reset.disabled =
    selectedMonthRange.startMonthIndex === 0 &&
    selectedMonthRange.endMonthIndex === monthOptions.length - 1;
  reset.addEventListener("click", () => {
    selectedMonthRange = { startMonthIndex: 0, endMonthIndex: monthOptions.length - 1 };
    render();
  });

  controls.append(title, startSelect, document.createTextNode("to"), endSelect, reset);
}

const ACTIVITY_BANDS = {
  weekly_growth_percent: [
    { label: "Green ≤+5%", min: null, max: 5, color: "#d8e8df" },
    { label: "Amber +5–15%", min: 5, max: 15, color: "#fff0bf" },
    { label: "Red >+15%*", min: 15, max: null, color: "#f3b7b2" },
  ],
  four_week_cases: [
    { label: "Green <15", min: null, max: 15, color: "#d8e8df" },
    { label: "Amber 15–59", min: 15, max: 60, color: "#fff0bf" },
    { label: "Red ≥60", min: 60, max: null, color: "#f3b7b2" },
  ],
  momentum_percent: [
    { label: "Green ≤+15%", min: null, max: 15, color: "#d8e8df" },
    { label: "Amber +15–40%", min: 15, max: 40, color: "#fff0bf" },
    { label: "Red >+40%", min: 40, max: null, color: "#f3b7b2" },
  ],
  year_over_year_percent: [
    { label: "Green ≤−20%", min: null, max: -20, color: "#d8e8df" },
    { label: "Amber −20–+20%", min: -20, max: 20, color: "#fff0bf" },
    { label: "Red >+20%", min: 20, max: null, color: "#f3b7b2" },
  ],
};

function riskBandRanges(bands, yMin, yMax) {
  return bands
    .map((band) => ({
      label: band.label,
      from: band.min === null || band.min === undefined ? yMin : band.min,
      to: band.max === null || band.max === undefined ? yMax : band.max,
      color: band.color,
    }))
    .filter((band) => band.to > yMin && band.from < yMax)
    .map((band) => ({
      ...band,
      from: Math.max(band.from, yMin),
      to: Math.min(band.to, yMax),
    }));
}

function clientPointToSvg(svg, event) {
  const transform = svg.getScreenCTM();
  if (!transform) {
    const bounds = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * svg.viewBox.baseVal.width,
      y: ((event.clientY - bounds.top) / bounds.height) * svg.viewBox.baseVal.height,
    };
  }
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(transform.inverse());
}

function ensureTooltip(svg) {
  const frame = svg.closest(".chart-frame");
  let tooltip = frame.querySelector(".chart-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    tooltip.setAttribute("role", "status");
    frame.append(tooltip);
  }
  tooltip.hidden = true;
  return tooltip;
}

function tooltipRows(grouped, dayIndex, field, formatter, weekly = false) {
  return Object.entries(grouped)
    .filter(([, rows]) => rows.some((row) => Number.isFinite(row[field])))
    .map(([year, rows]) => {
      const tolerance = weekly && rows.every((item) => item.frequency !== "daily") ? 3 : 0;
      const row = rows.filter((item) => Number.isFinite(item[field]) && Math.abs(item.day_index - dayIndex) <= tolerance)
        .sort((a, b) => Math.abs(a.day_index - dayIndex) - Math.abs(b.day_index - dayIndex) || b.day_index - a.day_index)[0] ?? null;
      return { year: Number(year), row, value: row?.[field] ?? null, formatted: row ? valueText(row[field], "--", formatter) : "—" };
    })
    .sort((a, b) => b.year - a.year);
}

function drawHoverLayer({
  svg,
  tooltip,
  grouped,
  field,
  formatter,
  xScale,
  yScale,
  margin,
  chartW,
  chartH,
  dayRange,
  weekly = false,
}) {
  const hoverGroup = svgEl("g", { class: "hover-layer", opacity: "0" });
  const hoverLine = svgEl("line", {
    y1: margin.top,
    y2: margin.top + chartH,
    class: "hover-line",
  });
  hoverGroup.appendChild(hoverLine);
  svg.appendChild(hoverGroup);

  const overlay = svgEl("rect", {
    x: margin.left,
    y: margin.top,
    width: chartW,
    height: chartH,
    fill: "transparent",
    class: "hover-overlay",
  });
  svg.appendChild(overlay);

  const showTooltip = (event) => {
    const svgPoint = clientPointToSvg(svg, event);
    const viewX = svgPoint.x;
    const daySpan = dayRange.end - dayRange.start;
    const dayIndex = Math.max(
      dayRange.start,
      Math.min(dayRange.end, Math.round(((viewX - margin.left) / chartW) * daySpan + dayRange.start)),
    );
    const rows = tooltipRows(grouped, dayIndex, field, formatter, weekly);
    if (rows.every(({ row }) => !row)) {
      hoverGroup.setAttribute("opacity", "0");
      tooltip.hidden = true;
      return;
    }

    clear(hoverGroup);
    const x = xScale(dayIndex);
    hoverGroup.appendChild(svgEl("line", { x1: x, x2: x, y1: margin.top, y2: margin.top + chartH, class: "hover-line" }));
    rows.filter(({ row }) => row).forEach(({ year, row, value }) => {
      hoverGroup.appendChild(
        svgEl("circle", {
          cx: xScale(row.day_index),
          cy: yScale(value),
          r: year === trackerData.current_year ? 4.8 : 3.8,
          fill: colorForYear(year),
          stroke: "#fff",
          "stroke-width": 1.4,
        }),
      );
    });
    hoverGroup.setAttribute("opacity", "1");

    const title = weekly
      ? `Around ${new Date(Date.UTC(2001, 0, dayIndex)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
      : rows.find(({ row }) => row)?.row.month_day;
    tooltip.innerHTML = [
      `<strong>${title}</strong>`,
      ...rows.map(
        ({ year, formatted, row }) =>
          `<span><i style="background:${colorForYear(year)}"></i>${year}: ${formatted}<small>${row ? `${weekly ? `${row.frequency === "daily" ? "7 days ending" : "Week ending"} ${fmt.format(new Date(`${row.date}T00:00:00Z`))} · ` : ""}${valueText(weekly ? row.weekly_cases : row.cases)} ${weekly ? row.frequency === "daily" ? "cases in trailing 7 days" : `case${row.weekly_cases === 1 ? "" : "s"} that week` : field === "risk_index" ? "reported daily cases" : "daily-equivalent cases"}` : "No nearby observation"}</small></span>`,
      ),
    ].join("");

    tooltip.hidden = false;
    const frameBounds = svg.closest(".chart-frame").getBoundingClientRect();
    const left = Math.min(frameBounds.width - tooltip.offsetWidth - 8, Math.max(8, event.clientX - frameBounds.left + 12));
    const top = Math.min(frameBounds.height - tooltip.offsetHeight - 8, Math.max(8, event.clientY - frameBounds.top + 12));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  overlay.addEventListener("mousemove", showTooltip);
  overlay.addEventListener("mouseleave", () => {
    hoverGroup.setAttribute("opacity", "0");
    tooltip.hidden = true;
  });
}

function drawChartWatermark(svg, width, height, margin) {
  const group = svgEl("g", {
    class: "chart-watermark",
    transform: `translate(${width - margin.right - 112} ${height - 8})`,
  });
  const note = svgEl("text", {
    x: 0,
    y: 0,
    class: "chart-watermark-note",
  });
  note.textContent = "© D²Sci public analytics";

  group.append(note);
  svg.appendChild(group);
}

function drawChart({ svgId, legendId, data, years, field, minY, label, riskBands = false, bands = riskBands ? activeStyling.riskBands : ACTIVITY_BANDS[field], series = data.series, title }) {
  const svg = byId(svgId);
  clear(svg);
  const tooltip = ensureTooltip(svg);
  const width = 960;
  const height = 430;
  const margin = { top: 76, right: 24, bottom: 46, left: 54 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  title ||= field === "risk_index" ? "NYC Mpox Case Growth Indicator" : "NYC Mpox Cumulative Reported Cases";
  const dayRange = visibleDayRange();
  const grouped = groupByYear(series, years, dayRange);
  const plottedYears = years.filter((year) => grouped[year]?.some((row) => Number.isFinite(row[field])));
  const frequencyByYear = field === "weekly_growth_percent"
    ? Object.fromEntries(plottedYears.map((year) => [year, grouped[year].find((row) => row.frequency)?.frequency ?? "weekly"]))
    : {};
  const yearLabels = plottedYears.map((year) => `${year}${frequencyByYear[year] ? ` ${frequencyByYear[year]}` : ""}`);
  const contextLines = [
    `NYC Health · Years plotted: ${yearLabels.length ? yearLabels.join(", ") : "none"} · Months: ${monthOptions[selectedMonthRange.startMonthIndex].label}–${monthOptions[selectedMonthRange.endMonthIndex].label}`,
    `Latest source week ending ${fmt.format(new Date(`${data.latest_data_date}T00:00:00Z`))} · ${label}`,
  ];
  svg.appendChild(svgEl("text", { x: margin.left, y: 22, class: "chart-inline-title" })).textContent = title;
  contextLines.forEach((line, index) => {
    svg.appendChild(svgEl("text", { x: margin.left, y: 43 + index * 18, class: "chart-inline-meta" })).textContent = line;
  });
  const values = Object.values(grouped)
    .flat()
    .map((row) => row[field])
    .filter((value) => value !== null && value !== undefined && Number.isFinite(value));

  let yMin = minY ?? Math.min(...values, 0);
  let yMax = Math.max(...values, bands ? (bands.at(-1).min ?? 1) + 1 : 1);
  if (!Number.isFinite(yMin)) yMin = 0;
  if (!Number.isFinite(yMax)) yMax = 1;
  if (bands && bands[0].max !== null) yMin = Math.min(yMin, bands[0].max - 1);
  if (riskBands) {
    yMin = Math.min(yMin, -1);
    yMax = Math.max(yMax, 4);
  }

  const yTicks = niceTicks(yMin, yMax, 6);
  yMin = Math.min(...yTicks);
  yMax = Math.max(...yTicks);

  const xScale = (day) => margin.left + ((day - dayRange.start) / (dayRange.end - dayRange.start)) * chartW;
  const yScale = (value) => margin.top + (1 - (value - yMin) / (yMax - yMin)) * chartH;

  if (bands) {
    riskBandRanges(bands, yMin, yMax).forEach((band) => {
      svg.appendChild(
        svgEl("rect", {
          x: margin.left,
          y: yScale(band.to),
          width: chartW,
          height: yScale(band.from) - yScale(band.to),
          fill: band.color,
          class: "risk-band",
        }),
      );
      svg.appendChild(
        svgEl("text", {
          x: width - margin.right - 98,
          y: yScale((band.from + band.to) / 2) + 4,
          class: "band-label",
        }),
      ).textContent = band.label;
    });
  }

  yTicks.forEach((tick) => {
    const y = yScale(tick);
    svg.appendChild(svgEl("line", { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: "grid-line" }));
    const labelNode = svgEl("text", { x: margin.left - 10, y: y + 4, "text-anchor": "end", class: "axis-label" });
    labelNode.textContent = compact.format(tick);
    svg.appendChild(labelNode);
  });

  monthTicks
    .filter(([_month, day]) => day >= dayRange.start && day <= dayRange.end)
    .forEach(([month, day]) => {
    const x = xScale(day);
    svg.appendChild(svgEl("line", { x1: x, x2: x, y1: margin.top, y2: height - margin.bottom, class: "grid-line" }));
    const labelNode = svgEl("text", { x, y: height - 16, "text-anchor": "middle", class: "axis-label" });
    labelNode.textContent = month;
    svg.appendChild(labelNode);
    });

  const yTitle = svgEl("text", {
    x: 16,
    y: margin.top + chartH / 2,
    transform: `rotate(-90 16 ${margin.top + chartH / 2})`,
    "text-anchor": "middle",
    class: "axis-title",
  });
  yTitle.textContent = label;
  svg.appendChild(yTitle);

  Object.entries(grouped).forEach(([year, rows]) => {
    const path = linePath(rows, xScale, yScale, field);
    if (!path) return;
    svg.appendChild(
      svgEl("path", {
        d: path,
        class: "series-line",
        stroke: colorForYear(year),
        "stroke-width": Number(year) === data.current_year ? 3.4 : 2.5,
        "stroke-dasharray": linePatternForYear(year).dash ?? "none",
        opacity: 1,
      }),
    );
  });

  const latest = series.find(
    (row) => row.year === data.current_year && row.date === data.latest_data_date,
  );
  if (latest && Number.isFinite(latest[field]) && years.includes(data.current_year)) {
    const x = xScale(latest.day_index);
    if (latest.day_index >= dayRange.start && latest.day_index <= dayRange.end) {
      svg.appendChild(svgEl("line", { x1: x, x2: x, y1: margin.top, y2: height - margin.bottom, class: "current-marker" }));

      const labelText = `Latest ${fmt.format(new Date(`${data.latest_data_date}T00:00:00Z`))}`;
      const labelX = Math.min(width - margin.right - 180, Math.max(margin.left + 8, x + 8));
      const labelY = margin.top + 16;
      svg.appendChild(
        svgEl("rect", {
          x: labelX - 6,
          y: labelY - 13,
          width: 180,
          height: 20,
          rx: 4,
          class: "current-marker-label-bg",
        }),
      );
      const currentLabel = svgEl("text", {
        x: labelX,
        y: labelY + 1,
        class: "current-marker-label",
      });
      currentLabel.textContent = labelText;
      svg.appendChild(currentLabel);
    }
  }

  drawHoverLayer({
    svg,
    tooltip,
    grouped,
    field,
    formatter: field === "risk_index" ? precise : field.endsWith("_percent") ? percentage : compact,
    weekly: series !== data.series,
    xScale,
    yScale,
    margin,
    chartW,
    chartH,
    dayRange,
  });
  drawChartWatermark(svg, width, height, margin);
  drawLegend(legendId, plottedYears, data.current_year, frequencyByYear);
}

function drawMomentumComponents(data, years, activity) {
  const svg = byId("momentumComponentsChart");
  clear(svg);
  const year = years.at(-1);
  const range = visibleDayRange();
  // activity already contains rolling averages from the full source history.
  // Apply the display filter only after those averages have been calculated.
  const rows = year === undefined ? [] : activity.filter((row) => row.year === year && isVisibleRow(row, range));
  const fields = [
    ["weekly_cases", "Weekly cases", "#2876d2", null, "solid"],
    ["four_week_average", "4-week average", "#ee6536", "10 4", "long dash"],
    ["thirteen_week_average", "13-week average", "#19a974", "2 3", "dotted"],
  ];
  const width = 960, height = 430;
  const margin = { top: 76, right: 24, bottom: 46, left: 54 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const title = `NYC Mpox Weekly Cases and Rolling Averages — ${year ?? "No year selected"}`;
  svg.appendChild(svgEl("text", { x: margin.left, y: 22, class: "chart-inline-title" })).textContent = title;
  svg.appendChild(svgEl("text", { x: margin.left, y: 43, class: "chart-inline-meta" })).textContent = `NYC Health · ${monthOptions[selectedMonthRange.startMonthIndex].label}–${monthOptions[selectedMonthRange.endMonthIndex].label} · Weekly counts and cases per week`;
  svg.appendChild(svgEl("text", { x: margin.left, y: 61, class: "chart-inline-meta" })).textContent = `Latest source week ending ${fmt.format(new Date(`${data.latest_data_date}T00:00:00Z`))}`;
  const values = rows.flatMap((row) => fields.map(([field]) => row[field])).filter((value) => Number.isFinite(value));
  const ticks = niceTicks(0, Math.max(1, ...values), 6);
  const yMax = Math.max(...ticks);
  const xScale = (day) => margin.left + ((day - range.start) / (range.end - range.start)) * chartW;
  const yScale = (value) => margin.top + (1 - value / yMax) * chartH;
  ticks.forEach((tick) => {
    const y = yScale(tick);
    svg.appendChild(svgEl("line", { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: "grid-line" }));
    svg.appendChild(svgEl("text", { x: margin.left - 10, y: y + 4, "text-anchor": "end", class: "axis-label" })).textContent = compact.format(tick);
  });
  monthTicks.filter(([, day]) => day >= range.start && day <= range.end).forEach(([month, day]) => {
    const x = xScale(day);
    svg.appendChild(svgEl("line", { x1: x, x2: x, y1: margin.top, y2: height - margin.bottom, class: "grid-line" }));
    svg.appendChild(svgEl("text", { x, y: height - 16, "text-anchor": "middle", class: "axis-label" })).textContent = month;
  });
  svg.appendChild(svgEl("text", { x: 16, y: margin.top + chartH / 2, transform: `rotate(-90 16 ${margin.top + chartH / 2})`, "text-anchor": "middle", class: "axis-title" })).textContent = "Cases per week";
  fields.forEach(([field, , color, dash]) => {
    const path = linePath(rows, xScale, yScale, field);
    if (path) svg.appendChild(svgEl("path", { d: path, class: "series-line", stroke: color, "stroke-width": field === "weekly_cases" ? 2.6 : 3, "stroke-dasharray": dash ?? "none" }));
    const latest = rows.at(-1);
    if (latest && Number.isFinite(latest[field])) svg.appendChild(svgEl("circle", { cx: xScale(latest.day_index), cy: yScale(latest[field]), r: 4.5, fill: color }));
  });
  drawChartWatermark(svg, width, height, margin);
  const legend = byId("momentumComponentsLegend");
  clear(legend);
  fields.forEach(([, name, color, dash, pattern]) => {
    const item = document.createElement("span"); item.className = "legend-item";
    const swatch = svgEl("svg", { width: 34, height: 12, "aria-hidden": "true", class: "legend-line-swatch" });
    swatch.append(svgEl("line", { x1: 1, x2: 33, y1: 6, y2: 6, stroke: color, "stroke-width": 3, "stroke-dasharray": dash ?? "none", "stroke-linecap": "round" }));
    item.setAttribute("aria-label", `${name}, ${pattern} line`);
    item.append(swatch, document.createTextNode(name)); legend.append(item);
  });
  const table = byId("momentumComponentsTable");
  clear(table);
  const caption = document.createElement("caption"); caption.textContent = `${title}. Source: NYC Health through ${data.latest_data_date}. Values are cases per week.`; table.append(caption);
  const head = document.createElement("thead"), header = document.createElement("tr");
  ["Week ending", ...fields.map(([, name]) => name)].forEach((name) => { const cell = document.createElement("th"); cell.scope = "col"; cell.textContent = name; header.append(cell); });
  head.append(header); table.append(head);
  const body = document.createElement("tbody");
  rows.forEach((row) => { const tr = document.createElement("tr"); const th = document.createElement("th"); th.scope = "row"; th.textContent = row.date; tr.append(th); fields.forEach(([field]) => { const td = document.createElement("td"); td.textContent = valueText(row[field], "—", precise); tr.append(td); }); body.append(tr); });
  table.append(body);
}

function renderSummary(data) {
  const buildAgeHours = (Date.now() - Date.parse(data.generated_at)) / 3600000;
  const freshStoplight = Number.isFinite(buildAgeHours) && buildAgeHours >= -1 && buildAgeHours <= 36 && data.case_stoplight?.rows?.length === 4;
  const growthColor = freshStoplight ? data.summary.weekly_growth_color : null;
  byId("riskBand").textContent = freshStoplight ? data.summary.weekly_growth_label || "Unavailable" : "Unavailable";
  byId("last28").textContent = valueText(data.summary.cases_last_28_days);
  byId("latestDate").textContent = fmt.format(new Date(`${data.latest_data_date}T00:00:00Z`));
  byId("generatedAt").textContent = `Generated ${fmt.format(new Date(data.generated_at))}`;

  const status = document.querySelector(".metric-status");
  status.classList.remove("very-low", "low", "moderate", "moderate-high", "high", "unknown");
  status.classList.add({ green: "low", amber: "moderate", red: "high" }[growthColor] || "unknown");

  const sourceList = byId("sourceList");
  clear(sourceList);
  data.sources.forEach((source) => {
    const wrapper = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = source.name;
    dd.textContent = `${source.rows} rows fetched from ${source.url}`;
    wrapper.append(dt, dd);
    sourceList.append(wrapper);
  });
}

function renderStoplight(data) {
  const stoplight = data.case_stoplight;
  const body = byId("stoplightBody");
  clear(body);
  const buildAgeHours = (Date.now() - Date.parse(data.generated_at)) / 3600000;
  const colors = new Set(["green", "amber", "red"]);
  const valid = stoplight?.version === 3 && typeof stoplight.as_of === "string" &&
    typeof stoplight.four_weeks_ago_date === "string" && Array.isArray(stoplight.rows) &&
    stoplight.rows.length === 4 && stoplight.rows[0]?.key === "growthIndicator" && Number.isFinite(buildAgeHours) && buildAgeHours >= -1 && buildAgeHours <= 36 &&
    stoplight.rows.every((item) => item && typeof item.name === "string" && typeof item.rule === "string" &&
      typeof item.changed_at === "string" && item.reading && colors.has(item.reading.color) &&
      typeof item.reading.value === "string" && item.four_weeks_ago && colors.has(item.four_weeks_ago.color) &&
      typeof item.four_weeks_ago.value === "string");
  if (!valid) {
    byId("redIndicatorShare").textContent = "--";
    byId("redIndicatorCount").textContent = "Current case stoplight unavailable";
    byId("stoplightMeta").textContent = "Weekly case stoplight unavailable.";
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = typeof stoplight?.unavailable_reason === "string" ? stoplight.unavailable_reason : "Awaiting a recently generated, compatible stoplight feed.";
    row.append(cell);
    body.append(row);
    return;
  }

  const redCount = stoplight.rows.filter((item) => item.reading.color === "red").length;
  byId("redIndicatorShare").textContent = `${Math.round((redCount / stoplight.rows.length) * 100)}%`;
  byId("redIndicatorCount").textContent = `${redCount} of ${stoplight.rows.length} indicators at last report`;

  const contrast = byId("stoplightContrast");
  const elevatedCounts = stoplight.rows.some((item) => (item.key === "level" || item.key === "momentum") && item.reading.color === "red");
  contrast.hidden = !(stoplight.rows[0].reading.color === "green" && elevatedCounts);
  contrast.textContent = contrast.hidden ? "" : "Case activity remained elevated at the last report even though growth pace was slow. Green here is not an all-clear.";

  byId("stoplightMeta").textContent = `Last published NYC Health case week ending ${fmt.format(new Date(`${stoplight.as_of}T00:00:00Z`))}. NYC Health publishes these weekly counts monthly, on the second Thursday at 4 p.m. The four readings describe that release, not the intervening weeks.`;
  byId("stoplightPriorDate").textContent = `As of ${fmt.format(new Date(`${stoplight.four_weeks_ago_date}T00:00:00Z`))}`;
  if (stoplight.source_url) byId("stoplightSource").href = stoplight.source_url;

  stoplight.rows.forEach((item) => {
    const row = document.createElement("tr");
    const changed = fmt.format(new Date(`${item.changed_at}T00:00:00Z`));

    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = item.name;
    const status = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `stoplight-badge ${item.reading.color}`;
    badge.textContent = item.reading.color;
    status.append(badge);
    const latest = document.createElement("td");
    latest.textContent = item.reading.value;
    const prior = document.createElement("td");
    prior.textContent = `${item.four_weeks_ago.value} (${item.four_weeks_ago.color} then)`;
    const detailCell = document.createElement("td");
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Why?";
    const rule = document.createElement("p");
    rule.textContent = item.rule;
    const changedNote = document.createElement("p");
    changedNote.textContent = `Last reported color since the week ending ${changed}.`;
    details.append(summary, rule, changedNote);
    detailCell.append(details);
    row.append(name, status, latest, prior, detailCell);
    body.append(row);
  });
}

function renderChartDataTable(tableId, data, years, field, title, series = data.series) {
  const table = byId(tableId);
  clear(table);
  const grouped = groupByYear(series, years, visibleDayRange());
  const byDay = new Map();
  Object.entries(grouped).forEach(([year, rows]) => {
    rows.forEach((row) => {
      if (!byDay.has(row.day_index)) byDay.set(row.day_index, { date: row.month_day, values: {} });
      byDay.get(row.day_index).values[year] = row[field];
    });
  });

  const caption = document.createElement("caption");
  caption.textContent = `${title}. NYC Health data through ${fmt.format(new Date(`${data.latest_data_date}T00:00:00Z`))}. Values for the selected years and months.`;
  table.append(caption);
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["Month and day", ...years.map(String)].forEach((name) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = name;
    headerRow.append(th);
  });
  head.append(headerRow);
  table.append(head);
  const body = document.createElement("tbody");
  [...byDay.entries()].sort(([a], [b]) => a - b).forEach(([, entry]) => {
    const row = document.createElement("tr");
    const dateCell = document.createElement("th");
    dateCell.scope = "row";
    dateCell.textContent = entry.date;
    row.append(dateCell);
    years.forEach((year) => {
      const cell = document.createElement("td");
      cell.textContent = valueText(entry.values[year], "—", field === "risk_index" ? precise : field.endsWith("_percent") ? percentage : compact);
      row.append(cell);
    });
    body.append(row);
  });
  table.append(body);
}

function render() {
  if (!trackerData) return;
  const years = [...selectedYears].sort((a, b) => a - b);
  const context = `Source: NYC Health · Years selected: ${years.length ? years.join(", ") : "none"} · Months shown: ${monthOptions[selectedMonthRange.startMonthIndex].label}–${monthOptions[selectedMonthRange.endMonthIndex].label} · Latest source week ending ${fmt.format(new Date(`${trackerData.latest_data_date}T00:00:00Z`))}`;
  byId("riskChartMeta").textContent = context;
  byId("cumulativeChartMeta").textContent = context;
  ["levelChartMeta", "momentumChartMeta", "yearComparisonChartMeta"].forEach((id) => { byId(id).textContent = context; });
  setupYearControls(trackerData);
  setupMonthControls();
  const activity = Array.isArray(trackerData.case_activity_series) ? trackerData.case_activity_series : [];
  const growth = Array.isArray(trackerData.case_growth_series) ? trackerData.case_growth_series : activity;
  drawChart({
    svgId: "riskChart",
    legendId: "riskLegend",
    data: trackerData,
    years,
    field: "weekly_growth_percent",
    label: "Estimated weekly case growth (%)",
    series: growth,
    title: "NYC Mpox Weekly Case Growth Trend",
  });
  drawChart({
    svgId: "cumulativeChart",
    legendId: "caseLegend",
    data: trackerData,
    years,
    field: "cumulative_cases",
    minY: 0,
    label: "Cumulative reported cases",
  });
  drawMomentumComponents(trackerData, years, activity);
  [
    { svgId: "levelChart", legendId: "levelLegend", tableId: "levelDataTable", field: "four_week_cases", title: "NYC Mpox Recent Case Level", label: "Cases in trailing four weeks", minY: 0 },
    { svgId: "momentumChart", legendId: "momentumLegend", tableId: "momentumDataTable", field: "momentum_percent", title: "NYC Mpox Momentum: 4-Week vs 13-Week Average", label: "Percentage difference in weekly averages" },
    { svgId: "yearComparisonChart", legendId: "yearComparisonLegend", tableId: "yearComparisonDataTable", field: "year_over_year_percent", title: "NYC Mpox 13-Week Percentage Change Versus Last Year", label: "Percentage change vs 52 weeks earlier" },
  ].forEach((chart) => {
    drawChart({ ...chart, data: trackerData, years, series: activity });
    renderChartDataTable(chart.tableId, trackerData, years, chart.field, `${chart.title} (${chart.label})`, activity);
  });
  renderChartDataTable("riskDataTable", trackerData, years, "weekly_growth_percent", "NYC mpox weekly case growth trend (percent per week; daily rolling where available, otherwise weekly)", growth);
  renderChartDataTable("caseDataTable", trackerData, years, "cumulative_cases", "NYC mpox cumulative reported cases");
}

fetch("data/risk_data.json", { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error(`Failed to load tracker data: ${response.status}`);
    return response.json();
  })
  .then((data) => {
    trackerData = data;
    activeStyling = resolveStyling(data);
    selectedYears = new Set(defaultYears(data));
    selectedMonthRange = defaultMonthRange();
    renderSummary(data);
    renderStoplight(data);
    render();
  })
  .catch((error) => {
    byId("riskBand").textContent = "Unavailable";
    byId("redIndicatorShare").textContent = "--";
    byId("redIndicatorCount").textContent = "Current case stoplight unavailable";
    byId("last28").textContent = "--";
    byId("latestDate").textContent = "--";
    byId("stoplightMeta").textContent = "Weekly case stoplight unavailable.";
    const errorRow = document.createElement("tr");
    const errorCell = document.createElement("td");
    errorCell.colSpan = 5;
    errorCell.textContent = "Tracker data could not be loaded.";
    errorRow.append(errorCell);
    byId("stoplightBody").replaceChildren(errorRow);
    byId("riskChartMeta").textContent = "Tracker data could not be loaded.";
    byId("cumulativeChartMeta").textContent = "Tracker data could not be loaded.";
    ["levelChartMeta", "momentumChartMeta", "yearComparisonChartMeta"].forEach((id) => { byId(id).textContent = "Tracker data could not be loaded."; });
    console.error(error);
  });

window.addEventListener("resize", render);

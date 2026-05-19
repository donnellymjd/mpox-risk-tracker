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
    { label: "Very Low", min: null, max: 0.0, color: "#e6f0f5" },
    { label: "Low", min: 0.0, max: 0.5, color: "#d8e8df" },
    { label: "Moderate", min: 0.5, max: 1.0, color: "#fff0bf" },
    { label: "Moderate-High", min: 1.0, max: 1.5, color: "#fbd1a7" },
    { label: "High", min: 1.5, max: null, color: "#f3b7b2" },
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
});

const compact = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

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

function classNameForBand(label) {
  return String(label || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function availableYears(data) {
  return [...new Set(data.series.map((row) => row.year))].sort((a, b) => a - b);
}

function defaultYears(data) {
  const years = availableYears(data);
  const wanted = [2022, data.current_year - 1, data.current_year];
  const defaults = wanted.filter((year, index) => wanted.indexOf(year) === index && years.includes(year));
  return defaults.length > 0 ? defaults : years.slice(-3);
}

function monthIndexFromDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return new Date().getUTCMonth();
  return date.getUTCMonth();
}

function defaultMonthRange(data) {
  const monthIndex = monthIndexFromDate(data.latest_data_date);
  return {
    startMonthIndex: Math.max(0, monthIndex - 1),
    endMonthIndex: Math.min(monthOptions.length - 1, monthIndex + 1),
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

function drawLegend(target, years, currentYear) {
  const legend = byId(target);
  clear(legend);
  years.forEach((year) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = colorForYear(year);
    if (year === currentYear) swatch.style.height = "5px";
    item.append(swatch, document.createTextNode(String(year)));
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

function riskBandRanges(data, yMin, yMax) {
  return activeStyling.riskBands
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
      x: ((event.clientX - bounds.left) / bounds.width) * 960,
      y: ((event.clientY - bounds.top) / bounds.height) * 380,
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

function tooltipRows(grouped, dayIndex, field, formatter) {
  return Object.entries(grouped)
    .map(([year, rows]) => {
      const row = rows.find((item) => item.day_index === dayIndex);
      if (!row || row[field] === null || row[field] === undefined) return null;
      return { year: Number(year), row, value: row[field], formatted: valueText(row[field], "--", formatter) };
    })
    .filter(Boolean)
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
    const rows = tooltipRows(grouped, dayIndex, field, formatter);
    if (rows.length === 0) {
      hoverGroup.setAttribute("opacity", "0");
      tooltip.hidden = true;
      return;
    }

    clear(hoverGroup);
    const x = xScale(dayIndex);
    hoverGroup.appendChild(svgEl("line", { x1: x, x2: x, y1: margin.top, y2: margin.top + chartH, class: "hover-line" }));
    rows.forEach(({ year, value }) => {
      hoverGroup.appendChild(
        svgEl("circle", {
          cx: x,
          cy: yScale(value),
          r: year === trackerData.current_year ? 4.8 : 3.8,
          fill: colorForYear(year),
          stroke: "#fff",
          "stroke-width": 1.4,
        }),
      );
    });
    hoverGroup.setAttribute("opacity", "1");

    const title = rows[0].row.month_day;
    tooltip.innerHTML = [
      `<strong>${title}</strong>`,
      ...rows.map(
        ({ year, formatted, row }) =>
          `<span><i style="background:${colorForYear(year)}"></i>${year}: ${formatted}<small>${valueText(row.cases)} cases</small></span>`,
      ),
    ].join("");

    const frameBounds = svg.closest(".chart-frame").getBoundingClientRect();
    const left = Math.min(frameBounds.width - 190, Math.max(8, event.clientX - frameBounds.left + 12));
    const top = Math.min(frameBounds.height - 90, Math.max(8, event.clientY - frameBounds.top + 12));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.hidden = false;
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

function drawChart({ svgId, legendId, data, years, field, minY, label, riskBands = false }) {
  const svg = byId(svgId);
  clear(svg);
  const tooltip = ensureTooltip(svg);
  const width = 960;
  const height = 380;
  const margin = { top: 20, right: 24, bottom: 46, left: 54 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const dayRange = visibleDayRange();
  const grouped = groupByYear(data.series, years, dayRange);
  const values = Object.values(grouped)
    .flat()
    .map((row) => row[field])
    .filter((value) => value !== null && value !== undefined && Number.isFinite(value));

  let yMin = minY ?? Math.min(...values, 0);
  let yMax = Math.max(...values, riskBands ? 1.6 : 1);
  if (!Number.isFinite(yMin)) yMin = 0;
  if (!Number.isFinite(yMax)) yMax = 1;
  if (riskBands) {
    yMin = Math.min(yMin, -1);
    yMax = Math.max(yMax, 4);
  }

  const yTicks = niceTicks(yMin, yMax, 6);
  yMin = Math.min(...yTicks);
  yMax = Math.max(...yTicks);

  const xScale = (day) => margin.left + ((day - dayRange.start) / (dayRange.end - dayRange.start)) * chartW;
  const yScale = (value) => margin.top + (1 - (value - yMin) / (yMax - yMin)) * chartH;

  if (riskBands) {
    riskBandRanges(data, yMin, yMax).forEach((band) => {
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
        "stroke-width": Number(year) === data.current_year ? 3.4 : 1.8,
        opacity: Number(year) === data.current_year ? 1 : 0.78,
      }),
    );
  });

  const latest = data.series.find(
    (row) => row.year === data.current_year && row.date === data.latest_data_date,
  );
  if (latest && years.includes(data.current_year)) {
    const x = xScale(latest.day_index);
    if (latest.day_index >= dayRange.start && latest.day_index <= dayRange.end) {
      svg.appendChild(svgEl("line", { x1: x, x2: x, y1: margin.top, y2: height - margin.bottom, class: "current-marker" }));

      const labelText = `Latest data ${latest.month_day}`;
      const labelX = Math.min(width - margin.right - 118, Math.max(margin.left + 8, x + 8));
      const labelY = margin.top + 16;
      svg.appendChild(
        svgEl("rect", {
          x: labelX - 6,
          y: labelY - 13,
          width: 116,
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
    formatter: field === "risk_index" ? precise : compact,
    xScale,
    yScale,
    margin,
    chartW,
    chartH,
    dayRange,
  });
  drawChartWatermark(svg, width, height, margin);
  drawLegend(legendId, years, data.current_year);
}

function renderSummary(data) {
  const band = data.summary.risk_band || "Unknown";
  byId("riskBand").textContent = band;
  byId("riskIndex").textContent = valueText(data.summary.risk_index, "--", precise);
  byId("last28").textContent = valueText(data.summary.cases_last_28_days);
  byId("latestDate").textContent = fmt.format(new Date(`${data.latest_data_date}T00:00:00Z`));
  byId("generatedAt").textContent = `Generated ${fmt.format(new Date(data.generated_at))}`;

  const status = document.querySelector(".metric-status");
  status.classList.remove("very-low", "low", "moderate", "moderate-high", "high", "unknown");
  status.classList.add(classNameForBand(band));

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

function render() {
  if (!trackerData) return;
  const years = [...selectedYears].sort((a, b) => a - b);
  setupYearControls(trackerData);
  setupMonthControls();
  drawChart({
    svgId: "riskChart",
    legendId: "riskLegend",
    data: trackerData,
    years,
    field: "risk_index",
    label: "Risk index",
    riskBands: true,
  });
  drawChart({
    svgId: "cumulativeChart",
    legendId: "caseLegend",
    data: trackerData,
    years,
    field: "cumulative_cases",
    minY: 0,
    label: "Cases",
  });
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
    selectedMonthRange = defaultMonthRange(data);
    renderSummary(data);
    render();
  })
  .catch((error) => {
    byId("riskBand").textContent = "Unavailable";
    byId("riskIndex").textContent = "--";
    byId("last28").textContent = "--";
    byId("latestDate").textContent = "--";
    console.error(error);
  });

window.addEventListener("resize", render);

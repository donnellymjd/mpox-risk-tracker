const palette = {
  2022: "#4f6f52",
  2023: "#7c4d1d",
  2024: "#5f5a8f",
  2025: "#146c94",
  2026: "#b7362c",
  2027: "#237a57",
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

const fmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const compact = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

let trackerData = null;

function byId(id) {
  return document.getElementById(id);
}

function valueText(value, fallback = "--") {
  return value === null || value === undefined ? fallback : compact.format(value);
}

function colorForYear(year) {
  return palette[year] || "#2f665f";
}

function yearsForMode(data, mode) {
  const years = [...new Set(data.series.map((row) => row.year))].sort((a, b) => a - b);
  if (mode === "current") return [data.current_year];
  if (mode === "recent") return years.slice(-3);
  return years;
}

function groupByYear(rows, years) {
  const wanted = new Set(years);
  return rows.reduce((acc, row) => {
    if (!wanted.has(row.year)) return acc;
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

function drawChart({ svgId, legendId, data, years, field, minY, label, riskBands = false }) {
  const svg = byId(svgId);
  clear(svg);
  const width = 960;
  const height = 380;
  const margin = { top: 20, right: 24, bottom: 46, left: 54 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const grouped = groupByYear(data.series, years);
  const values = Object.values(grouped)
    .flat()
    .map((row) => row[field])
    .filter((value) => value !== null && value !== undefined && Number.isFinite(value));

  let yMin = minY ?? Math.min(...values, 0);
  let yMax = Math.max(...values, riskBands ? 1.4 : 1);
  if (!Number.isFinite(yMin)) yMin = 0;
  if (!Number.isFinite(yMax)) yMax = 1;
  if (riskBands) {
    yMin = Math.min(yMin, -1.2);
    yMax = Math.max(yMax, 1.8);
  }

  const yTicks = niceTicks(yMin, yMax, 6);
  yMin = Math.min(...yTicks);
  yMax = Math.max(...yTicks);

  const xScale = (day) => margin.left + ((day - 1) / 364) * chartW;
  const yScale = (value) => margin.top + (1 - (value - yMin) / (yMax - yMin)) * chartH;

  if (riskBands) {
    const bands = [
      { from: Math.max(1, yMin), to: yMax, color: "rgba(183,54,44,0.13)", label: "Elevated" },
      { from: Math.max(0, yMin), to: Math.min(1, yMax), color: "rgba(178,122,5,0.14)", label: "Moderate" },
      { from: yMin, to: Math.min(0, yMax), color: "rgba(35,122,87,0.13)", label: "Low" },
    ];
    bands.forEach((band) => {
      if (band.to <= band.from) return;
      svg.appendChild(
        svgEl("rect", {
          x: margin.left,
          y: yScale(band.to),
          width: chartW,
          height: yScale(band.from) - yScale(band.to),
          fill: band.color,
        }),
      );
      svg.appendChild(
        svgEl("text", {
          x: width - margin.right - 84,
          y: yScale((band.from + band.to) / 2),
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

  monthTicks.forEach(([month, day]) => {
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
    svg.appendChild(svgEl("line", { x1: x, x2: x, y1: margin.top, y2: height - margin.bottom, class: "current-marker" }));
  }

  drawLegend(legendId, years, data.current_year);
}

function renderSummary(data) {
  const band = data.summary.risk_band || "Unknown";
  byId("riskBand").textContent = band;
  byId("riskIndex").textContent = valueText(data.summary.risk_index);
  byId("last28").textContent = valueText(data.summary.cases_last_28_days);
  byId("latestDate").textContent = fmt.format(new Date(`${data.latest_data_date}T00:00:00Z`));
  byId("generatedAt").textContent = `Generated ${fmt.format(new Date(data.generated_at))}`;

  const status = document.querySelector(".metric-status");
  status.classList.remove("low", "moderate", "elevated");
  status.classList.add(band.toLowerCase());

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
  const years = yearsForMode(trackerData, byId("yearMode").value);
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

byId("yearMode").addEventListener("change", render);
window.addEventListener("resize", render);

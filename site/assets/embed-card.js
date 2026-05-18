const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const numberFmt = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

fetch("data/summary.json", { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error(`Failed to load summary: ${response.status}`);
    return response.json();
  })
  .then((data) => {
    const summary = data.summary || {};
    setText("embedRiskBand", summary.risk_band || "Unavailable");
    setText(
      "embedRiskIndex",
      summary.risk_index === null || summary.risk_index === undefined
        ? "Risk index --"
        : `Risk index ${numberFmt.format(summary.risk_index)}`,
    );
    setText(
      "embedMeta",
      data.latest_data_date
        ? `Latest data ${dateFmt.format(new Date(`${data.latest_data_date}T00:00:00Z`))}`
        : "Latest data --",
    );
  })
  .catch(() => {
    setText("embedRiskBand", "Unavailable");
    setText("embedRiskIndex", "Risk index --");
    setText("embedMeta", "Latest data --");
  });

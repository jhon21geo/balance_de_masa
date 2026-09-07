const COLORS = {
  "Mica blanca / sericita": "#c4a35a",
  Clorita: "#3e5c48",
  "K-feldespato": "#6d3d62",
  "Fe-óxido": "#b85c38",
  Carbonato: "#6a8caf",
  "Calc-silicato": "#4f7c74",
  "Anfibol / calc-silicato": "#4f7c74",
  "Sulfuro Cu": "#c45c26",
  "Arcilla / sulfato": "#8b6b4a",
  "Sin mineral SWIR": "#b0a394",
  "Caolinita / arcilla": "#8b6b4a",
  Mixto: "#9a9084",
  Sericita: "#c4a35a",
  "Clorita-Fe-óxido": "#3e5c48",
  Propilitica: "#3e5c48",
  Argilica: "#b8963e",
  Potasica: "#6d3d62",
  Filica: "#8f2f22",
  Indefinida: "#b0a394",
};

const layoutBase = {
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "#fffaf2",
  font: { family: "Figtree, sans-serif", color: "#1b1712", size: 12 },
  margin: { t: 36, r: 18, b: 48, l: 56 },
  legend: { orientation: "h", y: -0.18 },
};

let SAMPLES = [];
let SUMMARY = {};

const $ = (id) => document.getElementById(id);

function colorOf(label) {
  return COLORS[label] || "#7a7166";
}

function unique(arr) {
  return [...new Set(arr)];
}

async function load() {
  const [samples, summary] = await Promise.all([
    fetch("data/samples.json").then((r) => r.json()),
    fetch("data/summary.json").then((r) => r.json()),
  ]);
  SAMPLES = samples;
  SUMMARY = summary;
  renderKpis();
  renderMap();
  renderGer();
  renderFeAl();
  renderCuW();
  renderMagsus();
  renderHeat();
  renderT4();
  setupHoles();
}

function renderKpis() {
  const m = SUMMARY.metrics;
  const items = [
    [SUMMARY.n_samples.toLocaleString("es"), "muestras comparadas"],
    [SUMMARY.n_holes, "sondajes (43 en el CSV)"],
    [`${m.spectral_mb_agree_pct} %`, "acuerdo TSA vs familia de masa"],
    [`${m.high_cu_w2200_in_window_pct} %`, "Cu alto dentro de w2200 2206–2221"],
  ];
  $("kpis").innerHTML = items
    .map(([n, l]) => `<div class="kpi"><b>${n}</b><span>${l}</span></div>`)
    .join("");
}

function renderMap() {
  const map = L.map("map", { scrollWheelZoom: false }).setView([-31.15, 137.15], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
    maxZoom: 12,
  }).addTo(map);

  SUMMARY.holes.forEach((h) => {
    if (h.lat == null || h.lon == null) return;
    const t4 = h.t4 || 0;
    const fill = t4 >= 4 ? "#8f2f22" : t4 >= 2 ? "#b85c38" : t4 >= 1 ? "#c4a35a" : "#3e5c48";
    const marker = L.circleMarker([h.lat, h.lon], {
      radius: 7 + Math.min(8, Math.log10((h.cu || 1) + 1) * 2),
      color: "#1b1712",
      weight: 1,
      fillColor: fill,
      fillOpacity: 0.85,
    }).addTo(map);
    const na = h.n - h.conc - h.disc;
    marker.bindPopup(
      `<strong>${h.id}</strong><br>${h.prospect}<br>n=${h.n} · Cu medio ${h.cu} ppm<br>índice Tabla 4 = ${h.t4}<br>TSA vs masa: ${h.conc} concordantes · ${h.disc} discordantes · ${na} sin z-score`
    );
    marker.on("click", () => {
      $("prospect").value = h.prospect;
      fillHoleSelect(h.prospect, h.id);
      drawHole(h.id);
    });
  });

  const refresh = () => map.invalidateSize();
  window.addEventListener("resize", refresh);
  setTimeout(refresh, 250);
  setTimeout(refresh, 1200);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) refresh();
    });
    io.observe($("map"));
  }

  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "map-legend");
    div.innerHTML = `
      <strong>Índice Tabla 4</strong>
      <span><i style="background:#8f2f22"></i> ≥ 4 elementos anómalos</span>
      <span><i style="background:#b85c38"></i> 2–3 elementos</span>
      <span><i style="background:#c4a35a"></i> 1 elemento</span>
      <span><i style="background:#3e5c48"></i> 0 (sin anomalía a 10× corteza)</span>
    `;
    return div;
  };
  legend.addTo(map);
}

function tracesBy(field, xKey, yKey, extra = {}) {
  const groups = {};
  SAMPLES.forEach((s) => {
    const g = s[field] || "s/d";
    (groups[g] ||= []).push(s);
  });
  return Object.entries(groups).map(([name, rows]) => ({
    x: rows.map((s) => s[xKey]),
    y: rows.map((s) => s[yKey]),
    text: rows.map((s) => `${s.h} ${s.f}–${s.t} m<br>${s.lith} · ${s.st}<br>Cu ${s.cu} ppm`),
    hoverinfo: "text",
    mode: "markers",
    type: "scatter",
    name,
    marker: { size: 7, opacity: 0.75, color: colorOf(name), ...extra.marker },
  }));
}

function renderGer() {
  Plotly.newPlot(
    "ger",
    tracesBy("mb", "naal", "kal"),
    {
      ...layoutBase,
      margin: { t: 36, r: 18, b: 90, l: 56 },
      title: { text: "GER recreado · color = balance de masa", font: { family: "Fraunces, serif", size: 16 } },
      xaxis: { title: "Na/Al molar (desde Na₂O / Al₂O₃)", range: [-0.02, 1.05], zeroline: false },
      yaxis: { title: "K/Al molar (desde K₂O / Al₂O₃)", range: [-0.02, 1.15], zeroline: false },
      legend: { orientation: "h", y: -0.28, title: { text: "Familia dominante (sin cuarzo)" } },
      shapes: [
        { type: "line", x0: 0, x1: 1, y0: 1, y1: 0, line: { color: "#1b1712", width: 1 } },
        { type: "line", x0: 0, x1: 1, y0: 1, y1: 1, line: { dash: "dot", color: "#6d3d62" } },
        { type: "line", x0: 0, x1: 1, y0: 0.33, y1: 0.33, line: { dash: "dot", color: "#c4a35a" } },
      ],
      annotations: [
        { x: 0.12, y: 1.05, text: "K-feldespato", showarrow: false, font: { size: 11 } },
        { x: 0.12, y: 0.37, text: "sericita", showarrow: false, font: { size: 11 } },
        { x: 0.92, y: 0.08, text: "albita", showarrow: false, font: { size: 11 } },
        { x: 0.55, y: 0.55, text: "AF", showarrow: false, font: { size: 11, color: "#1b1712" } },
      ],
    },
    { responsive: true, displayModeBar: false }
  );
}

function renderFeAl() {
  Plotly.newPlot(
    "feal",
    tracesBy("spec", "fe", "al"),
    {
      ...layoutBase,
      title: { text: "Fe vs Al · color = TSA (HyLogger)", font: { family: "Fraunces, serif", size: 16 } },
      xaxis: { title: "Fe (%)" },
      yaxis: { title: "Al (%)" },
    },
    { responsive: true, displayModeBar: false }
  );
}

function renderCuW() {
  const cu = SAMPLES.filter((s) => s.cu != null && s.cu > 0);
  Plotly.newPlot(
    "cuw22",
    [
      {
        x: cu.map((s) => s.w22),
        y: cu.map((s) => s.cu),
        mode: "markers",
        type: "scatter",
        marker: { size: 7, opacity: 0.7, color: cu.map((s) => colorOf(s.spec)) },
        text: cu.map((s) => `${s.h}<br>${s.spec}<br>w2200 ${s.w22}`),
        hoverinfo: "text",
        name: "muestras",
      },
    ],
    {
      ...layoutBase,
      title: { text: "Cu vs w2200 (recreado)", font: { family: "Fraunces, serif", size: 16 } },
      xaxis: { title: "w2200 (nm)" },
      yaxis: { title: "Cu (ppm)", type: "log" },
      shapes: [
        { type: "rect", x0: 2206, x1: 2221, y0: 0.1, y1: 100000, fillcolor: "rgba(184,92,56,0.08)", line: { width: 0 } },
      ],
    },
    { responsive: true, displayModeBar: false }
  );

  Plotly.newPlot(
    "cuw25",
    [
      {
        x: cu.map((s) => s.w25),
        y: cu.map((s) => s.cu),
        mode: "markers",
        type: "scatter",
        marker: { size: 7, opacity: 0.7, color: cu.map((s) => colorOf(s.spec)) },
        text: cu.map((s) => `${s.h}<br>${s.spec}<br>w2250 ${s.w25}`),
        hoverinfo: "text",
        name: "muestras",
      },
    ],
    {
      ...layoutBase,
      title: { text: "Cu vs w2250 (recreado)", font: { family: "Fraunces, serif", size: 16 } },
      xaxis: { title: "w2250 (nm)" },
      yaxis: { title: "Cu (ppm)", type: "log" },
      shapes: [
        { type: "rect", x0: 2246, x1: 2270, y0: 0.1, y1: 100000, fillcolor: "rgba(62,92,72,0.10)", line: { width: 0 } },
      ],
    },
    { responsive: true, displayModeBar: false }
  );
}

function renderMagsus() {
  const rows = SAMPLES.filter((s) => s.ms != null && s.ms > 0 && s.mt != null);
  Plotly.newPlot(
    "magsus",
    [
      {
        x: rows.map((s) => s.ms),
        y: rows.map((s) => s.mt),
        mode: "markers",
        type: "scatter",
        marker: {
          size: 7,
          opacity: 0.7,
          color: rows.map((s) => (s.hm || 0) - (s.mt || 0)),
          colorscale: [
            [0, "#3e5c48"],
            [0.5, "#c4a35a"],
            [1, "#b85c38"],
          ],
          colorbar: { title: "Hem−Mt", thickness: 12 },
        },
        text: rows.map((s) => `${s.h}<br>MagSus ${s.ms}<br>Mt ${s.mt}%  Hem ${s.hm}%`),
        hoverinfo: "text",
      },
    ],
    {
      ...layoutBase,
      title: { text: "MagSus vs magnetita del balance", font: { family: "Fraunces, serif", size: 16 } },
      xaxis: { title: "Susceptibilidad magnética (×10⁻⁵ SI)", type: "log" },
      yaxis: { title: "M_Magnetita (%)" },
      shapes: [
        { type: "line", x0: 5000, x1: 5000, y0: 0, y1: 50, line: { dash: "dash", color: "#8f2f22" } },
      ],
    },
    { responsive: true, displayModeBar: false }
  );
}

function renderHeat() {
  const mat = SUMMARY.matrices.spectral_vs_mb;
  const rows = Object.keys(mat);
  const colsSet = new Set();
  rows.forEach((r) => Object.keys(mat[r]).forEach((c) => colsSet.add(c)));
  const cols = [...colsSet];
  const z = rows.map((r) => cols.map((c) => mat[r][c] || 0));
  Plotly.newPlot(
    "heat",
    [
      {
        z,
        x: cols,
        y: rows,
        type: "heatmap",
        colorscale: [
          [0, "#fffaf2"],
          [0.35, "#e2c48a"],
          [0.7, "#b85c38"],
          [1, "#5c1f14"],
        ],
        hovertemplate: "%{y} → %{x}: %{z}<extra></extra>",
      },
    ],
    {
      ...layoutBase,
      margin: { t: 36, r: 10, b: 90, l: 180 },
      xaxis: { title: "Familia de balance", tickangle: -25 },
      yaxis: { title: "Mineral HyLogger / TSA", autorange: "reversed" },
    },
    { responsive: true, displayModeBar: false }
  );
}

function renderT4() {
  const rows = SAMPLES.filter((s) => s.cu != null && s.cu > 0);
  Plotly.newPlot(
    "t4",
    [
      {
        x: rows.map((s) => s.t4),
        y: rows.map((s) => s.cu),
        mode: "markers",
        type: "scatter",
        marker: { size: 7, opacity: 0.65, color: rows.map((s) => colorOf(s.asm.split("-")[0] || s.asm)) },
        text: rows.map((s) => `${s.h} · ${s.asm}<br>índice ${s.t4}<br>${s.chem} · ${s.val}`),
        hoverinfo: "text",
      },
    ],
    {
      ...layoutBase,
      title: { text: "Índice Tabla 4 vs Cu", font: { family: "Fraunces, serif", size: 16 } },
      xaxis: { title: "N.º de criterios geoquímicos cumplidos", dtick: 1 },
      yaxis: { title: "Cu (ppm)", type: "log" },
    },
    { responsive: true, displayModeBar: false }
  );
}

function setupHoles() {
  const prospects = unique(SUMMARY.holes.map((h) => h.prospect)).sort();
  $("prospect").innerHTML = prospects.map((p) => `<option>${p}</option>`).join("");
  const preferred = prospects.includes("Emmie Bluff") ? "Emmie Bluff" : prospects[0];
  $("prospect").value = preferred;
  fillHoleSelect(preferred);
  $("prospect").addEventListener("change", () => fillHoleSelect($("prospect").value));
  $("hole").addEventListener("change", () => drawHole($("hole").value));
}

function fillHoleSelect(prospect, selectedId) {
  const holes = SUMMARY.holes.filter((h) => h.prospect === prospect);
  $("hole").innerHTML = holes.map((h) => `<option value="${h.id}">${h.id} (${h.n})</option>`).join("");
  const pick = selectedId && holes.some((h) => h.id === selectedId) ? selectedId : holes[0]?.id;
  if (pick) {
    $("hole").value = pick;
    drawHole(pick);
  }
}

function drawHole(id) {
  const rows = SAMPLES.filter((s) => s.h === id).sort((a, b) => (a.f || 0) - (b.f || 0));
  if (!rows.length) return;
  const depth = rows.map((s) => {
    const a = s.f;
    const b = s.t;
    if (a == null && b == null) return 0;
    if (a == null) return b;
    if (b == null) return a;
    return (a + b) / 2;
  });
  const minerals = [
    ["mica", "Mica / sericita", "#c4a35a"],
    ["chl", "Clorita", "#3e5c48"],
    ["kf", "K-feldespato", "#6d3d62"],
    ["mt", "Magnetita", "#2c2c2c"],
    ["hm", "Hematita", "#b85c38"],
    ["carb", "Carbonato", "#6a8caf"],
    ["csil", "Calc-silicato", "#4f7c74"],
    ["qtz", "Cuarzo", "#d7cbb8"],
  ];
  Plotly.newPlot(
    "downMinerals",
    minerals.map(([key, name, color]) => ({
      y: depth,
      x: rows.map((s) => s[key] || 0),
      name,
      type: "bar",
      orientation: "h",
      marker: { color },
      hovertemplate: `${name}: %{x:.1f}%<extra></extra>`,
    })),
    {
      ...layoutBase,
      barmode: "stack",
      title: { text: `${id} · modos del balance`, font: { family: "Fraunces, serif", size: 16 } },
      xaxis: { title: "% peso", range: [0, 100] },
      yaxis: { title: "Profundidad (m)", autorange: "reversed" },
      legend: { orientation: "h", y: -0.16 },
      margin: { t: 40, r: 10, b: 70, l: 60 },
    },
    { responsive: true, displayModeBar: false }
  );

  Plotly.newPlot(
    "downChems",
    [
      { y: depth, x: rows.map((s) => s.fe), name: "Fe %", mode: "lines+markers", line: { color: "#b85c38" } },
      { y: depth, x: rows.map((s) => (s.cu || 0) / 100), name: "Cu ppm / 100", mode: "lines+markers", line: { color: "#c4a35a" } },
      { y: depth, x: rows.map((s) => (s.t4 || 0) * 4), name: "Tabla 4 × 4", mode: "lines+markers", line: { color: "#3e5c48" } },
    ],
    {
      ...layoutBase,
      title: { text: `${id} · geoquímica e índice Tabla 4`, font: { family: "Fraunces, serif", size: 16 } },
      xaxis: { title: "Fe %  ·  Cu/100  ·  índice×4" },
      yaxis: { title: "Profundidad (m)", autorange: "reversed" },
      legend: { orientation: "h", y: -0.16 },
    },
    { responsive: true, displayModeBar: false }
  );

  const h = SUMMARY.holes.find((x) => x.id === id);
  const nConc = rows.filter((s) => s.val === "Concordante").length;
  const nDisc = rows.filter((s) => s.val === "Discordante").length;
  $("holeMeta").textContent = `${id} · ${h?.prospect || ""} · ${rows.length} muestras · Cu medio ${h?.cu} ppm · TSA vs masa: ${nConc} concordantes, ${nDisc} discordantes.`;
}

load().catch((err) => {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<p class="wrap">No se pudieron cargar los datos: ${err}</p>`
  );
});

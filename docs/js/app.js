/* Paleta alineada con geoia.site/balance (ALT_COLORS + QUAL_PALETTE). */
const COLORS = {
  "Mica blanca / sericita": "#e6a23c",
  Clorita: "#67c23a",
  "K-feldespato": "#8a5cf6",
  "Fe-óxido": "#f56c6c",
  Carbonato: "#06b6d4",
  "Calc-silicato": "#84cc16",
  "Anfibol / calc-silicato": "#2563eb",
  "Sulfuro Cu": "#f97316",
  "Arcilla / sulfato": "#ec4899",
  "Sin mineral SWIR": "#c3c9d4",
  "Caolinita / arcilla": "#ec4899",
  Mixto: "#64748b",
  Sericita: "#e6a23c",
  "Clorita-Fe-óxido": "#67c23a",
  Propilitica: "#67c23a",
  Argilica: "#f56c6c",
  Potasica: "#8a5cf6",
  Filica: "#e6a23c",
  Indefinida: "#c3c9d4",
};

const DENSITY_COLORSCALE = [
  [0.0, "#08106b"],
  [0.15, "#1a4fd6"],
  [0.3, "#0ea5e9"],
  [0.45, "#22d3ee"],
  [0.58, "#4ade80"],
  [0.7, "#fde047"],
  [0.82, "#fb923c"],
  [0.92, "#ef4444"],
  [1.0, "#f0a6d6"],
];

const axisStyle = {
  gridcolor: "#e6e9f0",
  zerolinecolor: "#e6e9f0",
  linecolor: "#cbd5e1",
  tickcolor: "#94a3b8",
};

const layoutBase = {
  paper_bgcolor: "#ffffff",
  plot_bgcolor: "#ffffff",
  font: { family: "Figtree, Segoe UI, sans-serif", color: "#1f2937", size: 12 },
  margin: { t: 48, r: 18, b: 56, l: 64 },
  legend: { orientation: "h", y: -0.22 },
};

let SAMPLES = [];
let SUMMARY = {};

const $ = (id) => document.getElementById(id);

function colorOf(label) {
  return COLORS[label] || "#64748b";
}

function unique(arr) {
  return [...new Set(arr)];
}

function withAxes(layout) {
  return {
    ...layout,
    xaxis: { ...axisStyle, ...(layout.xaxis || {}) },
    yaxis: { ...axisStyle, ...(layout.yaxis || {}) },
  };
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
  renderGerTsa();
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
    [SUMMARY.n_holes, "sondajes"],
    [`${m.spectral_mb_agree_pct} %`, "mismo mineral principal"],
    [`${m.high_cu_w2200_in_window_pct} %`, "cobre en la banda de la mica"],
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
    const fill = t4 >= 4 ? "#e0201a" : t4 >= 2 ? "#f0631d" : t4 >= 1 ? "#f4e04d" : "#2563eb";
    const marker = L.circleMarker([h.lat, h.lon], {
      radius: 7 + Math.min(8, Math.log10((h.cu || 1) + 1) * 2),
      color: "#1e293b",
      weight: 1,
      fillColor: fill,
      fillOpacity: 0.85,
    }).addTo(map);
    const na = h.n - h.conc - h.disc;
    marker.bindPopup(
      `<strong>${h.id}</strong><br>${h.prospect}<br>n=${h.n} · Cu medio ${h.cu} ppm<br>índice Tabla 4 = ${h.t4}<br>espectro vs balance: ${h.conc} coinciden · ${h.disc} no coinciden · ${na} sin clasificar`
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
      <span><i style="background:#e0201a"></i> ≥ 4 elementos anómalos</span>
      <span><i style="background:#f0631d"></i> 2–3 elementos</span>
      <span><i style="background:#f4e04d"></i> 1 elemento</span>
      <span><i style="background:#2563eb"></i> 0 (sin anomalía)</span>
    `;
    return div;
  };
  legend.addTo(map);
}

function tracesBy(field, xKey, yKey) {
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
    marker: {
      size: 7,
      opacity: 0.78,
      color: colorOf(name),
      line: { width: 0.4, color: "#ffffff" },
    },
  }));
}

function gerShapes() {
  return [
    { type: "line", x0: 0, x1: 1, y0: 1, y1: 0, line: { color: "#1e293b", width: 1 } },
    { type: "line", x0: 0, x1: 1, y0: 1, y1: 1, line: { dash: "dot", color: "#8a5cf6" } },
    { type: "line", x0: 0, x1: 1, y0: 0.33, y1: 0.33, line: { dash: "dot", color: "#e6a23c" } },
  ];
}

function gerAnnotations() {
  return [
    { x: 0.12, y: 1.05, text: "K-feldespato", showarrow: false, font: { size: 11 } },
    { x: 0.12, y: 0.37, text: "sericita", showarrow: false, font: { size: 11 } },
    { x: 0.92, y: 0.08, text: "albita", showarrow: false, font: { size: 11 } },
    { x: 0.55, y: 0.55, text: "AF", showarrow: false, font: { size: 11, color: "#1e293b" } },
  ];
}

function renderGer() {
  Plotly.newPlot(
    "ger",
    tracesBy("mb", "naal", "kal"),
    withAxes({
      ...layoutBase,
      margin: { t: 48, r: 18, b: 90, l: 56 },
      title: { text: "Potasio / aluminio frente a sodio / aluminio", font: { size: 15 } },
      xaxis: { title: "Na/Al (molar)", range: [-0.02, 1.05], zeroline: false },
      yaxis: { title: "K/Al (molar)", range: [-0.02, 1.15], zeroline: false },
      legend: { orientation: "h", y: -0.28, title: { text: "Mineral principal del balance" } },
      shapes: gerShapes(),
      annotations: gerAnnotations(),
    }),
    { responsive: true, displayModeBar: false }
  );
}

function renderGerTsa() {
  Plotly.newPlot(
    "gertsa",
    tracesBy("spec", "naal", "kal"),
    withAxes({
      ...layoutBase,
      margin: { t: 48, r: 18, b: 90, l: 56 },
      title: { text: "Mismo diagrama, color = mineral del espectro", font: { size: 15 } },
      xaxis: { title: "Na/Al (molar)", range: [-0.02, 1.05], zeroline: false },
      yaxis: { title: "K/Al (molar)", range: [-0.02, 1.15], zeroline: false },
      legend: { orientation: "h", y: -0.28, title: { text: "Mineral visto por el espectrómetro" } },
      shapes: gerShapes(),
      annotations: gerAnnotations(),
    }),
    { responsive: true, displayModeBar: false }
  );
}

function renderFeAl() {
  Plotly.newPlot(
    "feal",
    tracesBy("spec", "al", "fe"),
    withAxes({
      ...layoutBase,
      title: { text: "Hierro frente a aluminio", font: { size: 15 } },
      xaxis: { title: "Al (%)" },
      yaxis: { title: "Fe (%)" },
      legend: { orientation: "h", y: -0.22, title: { text: "Mineral del espectro" } },
    }),
    { responsive: true, displayModeBar: false }
  );
}

function renderCuW() {
  const cu = SAMPLES.filter((s) => s.cu != null && s.cu > 0);
  Plotly.newPlot(
    "cuw22",
    [
      {
        x: cu.map((s) => s.cu),
        y: cu.map((s) => s.w22),
        mode: "markers",
        type: "scatter",
        marker: {
          size: 7,
          opacity: 0.75,
          color: cu.map((s) => colorOf(s.spec)),
          line: { width: 0.4, color: "#ffffff" },
        },
        text: cu.map((s) => `${s.h}<br>${s.spec}<br>banda mica ${s.w22} nm<br>Cu ${s.cu} ppm`),
        hoverinfo: "text",
        name: "muestras",
        showlegend: false,
      },
    ],
    withAxes({
      ...layoutBase,
      title: { text: "Banda de la mica (~2200 nm) frente a cobre", font: { size: 15 } },
      xaxis: { title: "Cu (ppm)" },
      yaxis: { title: "Posición de la banda de la mica (nm)", range: [2194, 2228] },
      shapes: [
        { type: "rect", x0: 0, x1: 55000, y0: 2206, y1: 2221, fillcolor: "rgba(230,162,60,0.14)", line: { width: 0 } },
      ],
    }),
    { responsive: true, displayModeBar: false }
  );

  Plotly.newPlot(
    "cuw25",
    [
      {
        x: cu.map((s) => s.cu),
        y: cu.map((s) => s.w25),
        mode: "markers",
        type: "scatter",
        marker: {
          size: 7,
          opacity: 0.75,
          color: cu.map((s) => colorOf(s.spec)),
          line: { width: 0.4, color: "#ffffff" },
        },
        text: cu.map((s) => `${s.h}<br>${s.spec}<br>banda clorita ${s.w25} nm<br>Cu ${s.cu} ppm`),
        hoverinfo: "text",
        name: "muestras",
        showlegend: false,
      },
    ],
    withAxes({
      ...layoutBase,
      title: { text: "Banda de la clorita (~2250 nm) frente a cobre", font: { size: 15 } },
      xaxis: { title: "Cu (ppm)" },
      yaxis: { title: "Posición de la banda de la clorita (nm)", range: [2238, 2266] },
      shapes: [
        { type: "rect", x0: 0, x1: 55000, y0: 2246, y1: 2264, fillcolor: "rgba(103,194,58,0.12)", line: { width: 0 } },
      ],
    }),
    { responsive: true, displayModeBar: false }
  );
}

function renderMagsus() {
  const rows = SAMPLES.filter((s) => s.ms != null && s.ms > 0);
  const holes = unique(rows.map((s) => s.h)).sort();
  Plotly.newPlot(
    "magsus",
    [
      {
        x: rows.map((s) => s.ms),
        y: rows.map((s) => s.h),
        mode: "markers",
        type: "scatter",
        marker: {
          size: 8,
          opacity: 0.8,
          color: rows.map((s) => s.mt || 0),
          colorscale: DENSITY_COLORSCALE,
          colorbar: { title: { text: "Magnetita<br>del balance (%)" }, thickness: 14 },
          line: { width: 0.3, color: "#ffffff" },
        },
        text: rows.map(
          (s) =>
            `${s.h}<br>susceptibilidad magnética ${s.ms}<br>magnetita ${s.mt}% · hematita ${s.hm}%`
        ),
        hoverinfo: "text",
      },
    ],
    withAxes({
      ...layoutBase,
      height: 620,
      margin: { t: 48, r: 90, b: 56, l: 90 },
      title: { text: "Susceptibilidad magnética por sondaje", font: { size: 15 } },
      xaxis: { title: "Susceptibilidad magnética (×10⁻⁵ SI)", type: "log" },
      yaxis: { title: "Sondaje", categoryorder: "array", categoryarray: holes.slice().reverse() },
      shapes: [
        { type: "line", xref: "x", yref: "paper", x0: 5000, x1: 5000, y0: 0, y1: 1, line: { dash: "dash", color: "#f56c6c", width: 2 } },
      ],
    }),
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
        colorscale: DENSITY_COLORSCALE,
        hovertemplate: "%{y} → %{x}: %{z}<extra></extra>",
      },
    ],
    withAxes({
      ...layoutBase,
      margin: { t: 36, r: 10, b: 90, l: 180 },
      xaxis: { title: "Mineral principal del balance", tickangle: -25 },
      yaxis: { title: "Mineral del espectro", autorange: "reversed" },
    }),
    { responsive: true, displayModeBar: false }
  );
}

function renderT4() {
  const rows = SAMPLES.filter((s) => s.cu != null && s.cu > 0);
  Plotly.newPlot(
    "t4",
    [
      {
        x: rows.map((s) => s.cu),
        y: rows.map((s) => s.t4),
        mode: "markers",
        type: "scatter",
        marker: {
          size: 7,
          opacity: 0.7,
          color: rows.map((s) => colorOf(s.chem)),
          line: { width: 0.4, color: "#ffffff" },
        },
        text: rows.map((s) => `${s.h} · ${s.asm}<br>índice ${s.t4}<br>${s.chem} · ${s.val}`),
        hoverinfo: "text",
        showlegend: false,
      },
    ],
    withAxes({
      ...layoutBase,
      title: { text: "Índice de anomalías (Tabla 4) frente a cobre", font: { size: 15 } },
      xaxis: { title: "Cu (ppm)" },
      yaxis: { title: "N.º de elementos anómalos", dtick: 1 },
    }),
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
    ["mica", "Mica / sericita", "#e6a23c"],
    ["chl", "Clorita", "#67c23a"],
    ["kf", "K-feldespato", "#8a5cf6"],
    ["mt", "Magnetita", "#1e293b"],
    ["hm", "Hematita", "#f56c6c"],
    ["carb", "Carbonato", "#06b6d4"],
    ["csil", "Calc-silicato", "#84cc16"],
    ["qtz", "Cuarzo", "#c3c9d4"],
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
    withAxes({
      ...layoutBase,
      barmode: "stack",
      title: { text: `${id} · minerales del balance`, font: { size: 15 } },
      xaxis: { title: "% en peso", range: [0, 100] },
      yaxis: { title: "Profundidad (m)", autorange: "reversed" },
      legend: { orientation: "h", y: -0.16 },
      margin: { t: 40, r: 10, b: 70, l: 60 },
    }),
    { responsive: true, displayModeBar: false }
  );

  Plotly.newPlot(
    "downChems",
    [
      { y: depth, x: rows.map((s) => s.fe), name: "Fe %", mode: "lines+markers", line: { color: "#f56c6c" } },
      { y: depth, x: rows.map((s) => (s.cu || 0) / 100), name: "Cu ppm / 100", mode: "lines+markers", line: { color: "#e6a23c" } },
      { y: depth, x: rows.map((s) => (s.t4 || 0) * 4), name: "Tabla 4 × 4", mode: "lines+markers", line: { color: "#2563eb" } },
    ],
    withAxes({
      ...layoutBase,
      title: { text: `${id} · química e índice de anomalías`, font: { size: 15 } },
      xaxis: { title: "Fe %  ·  Cu/100  ·  índice×4" },
      yaxis: { title: "Profundidad (m)", autorange: "reversed" },
      legend: { orientation: "h", y: -0.16 },
    }),
    { responsive: true, displayModeBar: false }
  );

  const h = SUMMARY.holes.find((x) => x.id === id);
  const nConc = rows.filter((s) => s.val === "Concordante").length;
  const nDisc = rows.filter((s) => s.val === "Discordante").length;
  $("holeMeta").textContent = `${id} · ${h?.prospect || ""} · ${rows.length} muestras · Cu medio ${h?.cu} ppm · espectro vs balance: ${nConc} coinciden, ${nDisc} no coinciden.`;
}

load().catch((err) => {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<p class="wrap">No se pudieron cargar los datos: ${err}</p>`
  );
});

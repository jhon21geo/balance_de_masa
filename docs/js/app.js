/* Paleta GeoIA para el balance; paleta del informe (ioGAS) para ensamblajes. */
const COLORS = {
  "Mica blanca / sericita": "#e6a23c",
  Clorita: "#67c23a",
  "K-feldespato": "#8a5cf6",
  "Fe-óxido": "#808080",
  Carbonato: "#06b6d4",
  "Calc-silicato": "#84cc16",
  "Anfibol / calc-silicato": "#4169e1",
  "Sulfuro Cu": "#f97316",
  "Arcilla / sulfato": "#ec4899",
  "Sin mineral SWIR": "#c3c9d4",
  "Caolinita / arcilla": "#ec4899",
  Mixto: "#64748b",
  Sericita: "#e41a1c",
  "Clorita-Fe-óxido": "#20b2aa",
  "Sericita-Fe-óxido": "#8b4513",
  "Sericita-clorita": "#ffd700",
  "Sericita-clorita-Fe-óxido": "#daa520",
  "K-feldespato-sericita": "#ff69b4",
  "K-feldespato-Fe-óxido": "#800080",
  "K-feldespato-magnetita": "#4b0082",
  "K-feldespato-sericita-Fe-óxido": "#db7093",
  "Clorita-magnetita": "#008b8b",
  "Sericita-magnetita": "#a0522d",
  "Clorita-anfibol-Fe-óxido": "#006400",
  "Clorita-anfibol": "#228b22",
  Anfibol: "#4169e1",
  Magnetita: "#1e293b",
  "Carbonato-Fe-óxido": "#4682b4",
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
  margin: { t: 36, r: 10, b: 48, l: 54 },
  autosize: true,
};

const legendInside = {
  orientation: "v",
  x: 0.99,
  y: 0.99,
  xanchor: "right",
  yanchor: "top",
  bgcolor: "rgba(255,255,255,0.92)",
  bordercolor: "#cbd5e1",
  borderwidth: 1,
  font: { size: 10 },
  itemsizing: "constant",
  tracegroupgap: 1,
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
  renderMaps();
  renderGer();
  renderGerTsa();
  renderFeAl();
  renderCuW();
  renderMagsus();
  renderHeat();
  renderT4();
  setupHoles();
  requestAnimationFrame(() => {
    document.querySelectorAll(".plot-box .chart").forEach((el) => {
      if (window.Plotly && el.id) Plotly.Plots.resize(el);
    });
  });
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

function holePopup(h) {
  const na = h.n - h.conc - h.disc;
  return `<strong>${h.id}</strong><br>${h.prospect}<br>n=${h.n} · Cu medio ${h.cu} ppm<br>índice Tabla 4 = ${h.t4}<br>alteración: ${h.chem || "s/d"} · mezcla: ${h.asm || "s/d"}<br>espectro vs balance: ${h.conc} coinciden · ${h.disc} no coinciden · ${na} sin clasificar`;
}

function attachHoleMarker(map, h, fill) {
  if (h.lat == null || h.lon == null) return;
  const marker = L.circleMarker([h.lat, h.lon], {
    radius: 7 + Math.min(8, Math.log10((h.cu || 1) + 1) * 2),
    color: "#1e293b",
    weight: 1,
    fillColor: fill,
    fillOpacity: 0.85,
  }).addTo(map);
  marker.bindPopup(holePopup(h));
  marker.on("click", () => {
    $("prospect").value = h.prospect;
    fillHoleSelect(h.prospect, h.id);
    drawHole(h.id);
  });
}

function keepMapsInSync(a, b) {
  let lock = false;
  const copy = (from, to) => {
    if (lock) return;
    lock = true;
    to.setView(from.getCenter(), from.getZoom(), { animate: false });
    lock = false;
  };
  a.on("moveend", () => copy(a, b));
  b.on("moveend", () => copy(b, a));
}

function addMapLegend(map, title, rows) {
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "map-legend");
    div.innerHTML = `<strong>${title}</strong>` + rows.map(([c, t]) => `<span><i style="background:${c}"></i> ${t}</span>`).join("");
    return div;
  };
  legend.addTo(map);
}

function watchMapSize(map, el) {
  const refresh = () => map.invalidateSize();
  window.addEventListener("resize", refresh);
  setTimeout(refresh, 250);
  setTimeout(refresh, 1200);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) refresh();
    });
    io.observe(el);
  }
}

function renderMaps() {
  const view = { center: [-31.15, 137.15], zoom: 7 };
  const tiles = () =>
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 12,
    });

  const map = L.map("map", { scrollWheelZoom: false }).setView(view.center, view.zoom);
  tiles().addTo(map);
  SUMMARY.holes.forEach((h) => {
    const t4 = h.t4 || 0;
    const fill = t4 >= 4 ? "#e0201a" : t4 >= 2 ? "#f0631d" : t4 >= 1 ? "#f4e04d" : "#2563eb";
    attachHoleMarker(map, h, fill);
  });
  addMapLegend(map, "Índice Tabla 4", [
    ["#e0201a", "≥ 4 elementos anómalos"],
    ["#f0631d", "2–3 elementos"],
    ["#f4e04d", "1 elemento"],
    ["#2563eb", "0 (sin anomalía)"],
  ]);
  watchMapSize(map, $("map"));

  const mapAlt = L.map("mapAlt", { scrollWheelZoom: false }).setView(view.center, view.zoom);
  tiles().addTo(mapAlt);
  SUMMARY.holes.forEach((h) => attachHoleMarker(mapAlt, h, colorOf(h.chem)));
  addMapLegend(mapAlt, "Alteración (GeoIA)", [
    ["#e6a23c", "Fílica"],
    ["#f56c6c", "Argílica"],
    ["#67c23a", "Propilítica"],
    ["#8a5cf6", "Potásica"],
    ["#c3c9d4", "Indefinida"],
  ]);
  watchMapSize(mapAlt, $("mapAlt"));
  keepMapsInSync(map, mapAlt);
}

function tracesBy(field, xKey, yKey, rows = SAMPLES) {
  const groups = {};
  rows.forEach((s) => {
    const g = s[field] || "s/d";
    (groups[g] ||= []).push(s);
  });
  return Object.entries(groups).map(([name, group]) => ({
    x: group.map((s) => s[xKey]),
    y: group.map((s) => s[yKey]),
    text: group.map((s) => `${s.h} ${s.f}–${s.t} m<br>${s.lith} · ${s.st}<br>Cu ${s.cu} ppm`),
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
    { x: 0.14, y: 0.96, text: "K-feldespato", showarrow: false, font: { size: 11 } },
    { x: 0.14, y: 0.37, text: "sericita", showarrow: false, font: { size: 11 } },
    { x: 0.88, y: 0.08, text: "albita", showarrow: false, font: { size: 11 } },
    { x: 0.52, y: 0.52, text: "AF", showarrow: false, font: { size: 11, color: "#1e293b" } },
  ];
}

function renderGer() {
  Plotly.newPlot(
    "ger",
    tracesBy("mb", "naal", "kal"),
    withAxes({
      ...layoutBase,
      legend: legendInside,
      title: { text: "Potasio / aluminio frente a sodio / aluminio", font: { size: 14 } },
      xaxis: { title: "Na/Al (molar)", range: [0, 1], zeroline: false },
      yaxis: { title: "K/Al (molar)", range: [0, 1], zeroline: false },
      shapes: gerShapes(),
      annotations: gerAnnotations(),
    }),
    { responsive: true, displayModeBar: false }
  );
}

function renderGerTsa() {
  Plotly.newPlot(
    "gertsa",
    tracesBy("asm", "naal", "kal"),
    withAxes({
      ...layoutBase,
      legend: legendInside,
      title: { text: "Mismo diagrama, color = mezcla del informe", font: { size: 14 } },
      xaxis: { title: "Na/Al (molar)", range: [0, 1], zeroline: false },
      yaxis: { title: "K/Al (molar)", range: [0, 1], zeroline: false },
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
      legend: legendInside,
      title: { text: "Hierro frente a aluminio", font: { size: 14 } },
      xaxis: { title: "Al (%)", range: [0, 15] },
      yaxis: { title: "Fe (%)", range: [0, 65] },
    }),
    { responsive: true, displayModeBar: false }
  );
}

function renderCuW() {
  const mica = SAMPLES.filter((s) => s.cu != null && s.cu > 0 && s.w22 != null);
  Plotly.newPlot(
    "cuw22",
    tracesBy("asm", "cu", "w22", mica),
    withAxes({
      ...layoutBase,
      legend: legendInside,
      title: { text: "Banda de la mica (~2200 nm) frente a cobre", font: { size: 14 } },
      xaxis: { title: "Cu (ppm)", range: [0, 50000] },
      yaxis: { title: "Posición de la banda de la mica (nm)", range: [2195, 2227.5] },
      shapes: [
        { type: "line", x0: 0, x1: 50000, y0: 2206, y1: 2206, line: { dash: "dash", color: "#1e293b", width: 1 } },
        { type: "line", x0: 0, x1: 50000, y0: 2221, y1: 2221, line: { dash: "dash", color: "#1e293b", width: 1 } },
      ],
      annotations: [
        { x: 1500, y: 2206, text: "2206 nm", showarrow: false, font: { size: 10 }, xanchor: "left", yshift: -10 },
        { x: 1500, y: 2221, text: "2221 nm", showarrow: false, font: { size: 10 }, xanchor: "left", yshift: 10 },
      ],
    }),
    { responsive: true, displayModeBar: false }
  );

  const chl = SAMPLES.filter((s) => s.cu != null && s.cu > 0 && s.w25 != null);
  Plotly.newPlot(
    "cuw25",
    tracesBy("asm", "cu", "w25", chl),
    withAxes({
      ...layoutBase,
      legend: legendInside,
      title: { text: "Banda de la clorita (~2250 nm) frente a cobre", font: { size: 14 } },
      xaxis: { title: "Cu (ppm)", range: [0, 25000] },
      yaxis: { title: "Posición de la banda de la clorita (nm)", range: [2240, 2263] },
      shapes: [
        { type: "line", x0: 0, x1: 25000, y0: 2246, y1: 2246, line: { dash: "dash", color: "#1e293b", width: 1 } },
      ],
      annotations: [
        { x: 800, y: 2246, text: "2246 nm", showarrow: false, font: { size: 10 }, xanchor: "left", yshift: -10 },
      ],
    }),
    { responsive: true, displayModeBar: false }
  );
}

function renderMagsus() {
  const rows = SAMPLES.filter((s) => s.ms != null && s.ms > 0);
  const holes = unique(rows.map((s) => s.h)).sort();
  const groups = {};
  rows.forEach((s) => {
    (groups[s.asm || "s/d"] ||= []).push(s);
  });
  const traces = Object.entries(groups).map(([name, group]) => ({
    x: group.map((s) => s.ms),
    y: group.map((s) => s.h),
    mode: "markers",
    type: "scatter",
    name,
    marker: {
      size: 8,
      opacity: 0.8,
      color: colorOf(name),
      symbol: group.map((s) => (s.ms >= 5000 ? "circle-open" : "circle")),
      line: { width: 1.2, color: colorOf(name) },
    },
    text: group.map(
      (s) =>
        `${s.h}<br>${s.asm}<br>susceptibilidad ${s.ms}<br>magnetita del balance ${s.mt}%`
    ),
    hoverinfo: "text",
  }));
  Plotly.newPlot(
    "magsus",
    traces,
    withAxes({
      ...layoutBase,
      legend: legendInside,
      margin: { t: 36, r: 10, b: 48, l: 72 },
      title: { text: "Susceptibilidad magnética por sondaje", font: { size: 14 } },
      xaxis: { title: "Susceptibilidad magnética (×10⁻⁵ SI)", type: "log", range: [-2, 5] },
      yaxis: { title: "Sondaje", categoryorder: "array", categoryarray: holes.slice().reverse() },
      shapes: [
        { type: "line", xref: "x", yref: "paper", x0: 5000, x1: 5000, y0: 0, y1: 1, line: { dash: "dash", color: "#2563eb", width: 1.5 } },
      ],
      annotations: [
        { x: 200, y: 1.02, yref: "paper", text: "hematita", showarrow: false, font: { size: 11, color: "#2563eb" } },
        { x: 30000, y: 1.02, yref: "paper", text: "magnetita", showarrow: false, font: { size: 11, color: "#2563eb" } },
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

/* Neurotech Ecosystem viewer. Reads graph.json (built by tools/ntgraph.py) and renders it with force-graph. */
(() => {
"use strict";

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Entity types: four colour families, with shape separating the types that share one.
const TYPES = {
  project:    { label: "Projects",     color: "teal",    shape: "circle",   base: 4.5 },
  device:     { label: "Devices",      color: "violet",   shape: "square",   base: 3.5 },
  modality:   { label: "Technologies", color: "violet",   shape: "hexagon",  base: 7 },
  org:        { label: "Organisations", color: "yellow", shape: "square",   base: 3.5 },
  person:     { label: "People",       color: "yellow",  shape: "triangle-down", base: 3 },
  indication: { label: "Indications",  color: "magenta", shape: "triangle", base: 4.5 },
  problem:    { label: "Gaps",         color: "magenta", shape: "diamond",  base: 4.5 },
};
const KIND_LABEL = {
  software: "Software project", hardware: "Hardware project", resource: "Resource list", dataset: "Dataset or archive", standard: "Standard",
  company: "Company", university: "University", institute: "Institute", lab: "Lab", oss_team: "Open-source team",
  community: "Community", standards_body: "Standards body", regulator: "Regulator",
  bottleneck: "Gap", capability: "Capability",
};
const TYPE_LABEL = { device: "Device", person: "Person", modality: "Technology", indication: "Indication" };
const typeLabel = (n) => KIND_LABEL[n.kind] || TYPE_LABEL[n.type] || n.type;

const LENSES = {
  class: { key: "class", values: [["sensing", "Sensing", "teal"], ["modulating", "Modulating", "yellow"]] },
  invasiveness: { key: "invasiveness", values: [["noninvasive", "Noninvasive", "teal"], ["invasive", "Invasive", "magenta"]] },
};
const REL = {
  MAINTAINS: ["Maintains", "Maintained by"],
  AFFILIATED_WITH: ["Affiliated with", "Members and units"],
  DEPENDS_ON: ["Depends on", "Depended on by"],
  INTEGRATES_WITH: ["Integrates with", "Integrated by"],
  USES: ["Technologies", "Projects and devices"],
  INDICATED_FOR: ["Indicated for", "Diagnosed or treated with"],
  ADDRESSES: ["Addresses", "Addressed by"],
  REALLY_WANTS: ["Really wants", "Wanted by"],
  BLOCKS: ["Blocks", "Blocked by"],
};
const CLAIM_EDGES = new Set(["REALLY_WANTS", "ADDRESSES", "BLOCKS", "INDICATED_FOR"]);
const LINK_DISTANCE = { USES: 90, AFFILIATED_WITH: 30, MAINTAINS: 38 };

const state = {
  lens: "type", types: new Set(Object.keys(TYPES)), cls: "", inv: "", modality: "", clinical: false,
  selected: null, hovered: null, highlight: null,
};
let graph, byId, fg, C = {}, adjacency = {}, allLinks = [];

// ------------------------------------------------------------------ colour ---
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ["teal", "yellow", "magenta", "violet", "neutral", "text", "text-2", "bg", "link", "link-hi"]) {
    C[k] = cs.getPropertyValue(`--${k}`).trim();
  }
}
function alpha(color, a) {
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  return color.replace(/[\d.]+\)$/, `${a})`);
}
/** One colour, or two for an entity that spans both values of the active lens. */
function nodeColors(n) {
  if (state.lens === "type") return [C[TYPES[n.type].color]];
  const lens = LENSES[state.lens];
  const hit = lens.values.filter(([v]) => n.facets[lens.key].includes(v)).map(([, , c]) => C[c]);
  return hit.length ? hit : [C.neutral];
}

// ------------------------------------------------------------------ shapes ---
function shapePath(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === "circle") ctx.arc(x, y, r, 0, 2 * Math.PI);
  else if (shape === "square") ctx.roundRect ? ctx.roundRect(x - r * .88, y - r * .88, r * 1.76, r * 1.76, r * .3) : ctx.rect(x - r * .88, y - r * .88, r * 1.76, r * 1.76);
  else {
    const tri = shape.startsWith("triangle");
    const pts = shape === "hexagon" ? 6 : tri ? 3 : 4;
    const rot = shape === "hexagon" ? 0 : shape === "triangle-down" ? Math.PI / 2 : -Math.PI / 2;
    const rr = tri ? r * 1.25 : shape === "diamond" ? r * 1.15 : r;
    for (let i = 0; i < pts; i++) {
      const a = rot + (i * 2 * Math.PI) / pts;
      ctx[i ? "lineTo" : "moveTo"](x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    ctx.closePath();
  }
}
function glyph(shape, color, hollow) {
  const body = {
    circle: '<circle cx="7" cy="7" r="5.5"/>', square: '<rect x="2" y="2" width="10" height="10" rx="2"/>',
    hexagon: '<path d="M13 7l-3 5.2H4L1 7l3-5.2h6z"/>', triangle: '<path d="M7 1l6.2 11H.8z"/>',
    "triangle-down": '<path d="M7 13L.8 2h12.4z"/>', diamond: '<path d="M7 .5L13.5 7 7 13.5.5 7z"/>',
  }[shape];
  const svg = el("span", { className: "glyph" });
  svg.innerHTML = `<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" ${
    hollow ? `fill="none" stroke="${color}" stroke-width="1.6"` : `fill="${color}"`}>${body}</svg>`;
  return svg;
}

function isHollow(n) { return n.status === "proposed" || n.kind === "capability"; }
function isLit(n) { return !state.highlight || state.highlight.has(n.id); }

function drawNode(n, ctx, scale) {
  const { shape } = TYPES[n.type];
  const colors = nodeColors(n);
  const lit = isLit(n);
  const focus = n.id === state.selected || n.id === state.hovered;
  ctx.save();
  ctx.globalAlpha = lit ? 1 : 0.1;
  shapePath(ctx, shape, n.x, n.y, n.r);
  if (isHollow(n)) {
    ctx.fillStyle = C.bg; ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = colors[0];
    if (n.status === "proposed") ctx.setLineDash([2.2, 1.6]);
    ctx.stroke(); ctx.setLineDash([]);
  } else {
    if (focus || (state.highlight && lit)) { ctx.shadowColor = colors[0]; ctx.shadowBlur = focus ? 26 : 12; }
    ctx.fillStyle = colors[0]; ctx.fill();
    ctx.shadowBlur = 0;
    if (colors[1]) { // spans both values: paint the right half in the second colour
      ctx.save(); ctx.clip();
      ctx.fillStyle = colors[1]; ctx.fillRect(n.x, n.y - n.r * 2, n.r * 2, n.r * 4);
      ctx.restore();
    }
  }
  if (focus) {
    shapePath(ctx, shape, n.x, n.y, n.r + 2.2 / scale + 1);
    ctx.lineWidth = 1.5 / scale; ctx.strokeStyle = C.text; ctx.stroke();
  }
  // Labels: hubs first, more as you zoom in; always for the lit neighbourhood.
  const always = focus || (state.highlight && lit) || n.type === "modality" || n.hub;
  if (lit && (always || n.r * scale > 8.5)) {
    const size = (focus ? 13 : 11) / scale;
    ctx.font = `${focus || n.type === "modality" ? 600 : 400} ${size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    const y = n.y + n.r * 1.25 + 2 / scale;
    ctx.lineWidth = 3 / scale; ctx.lineJoin = "round"; ctx.strokeStyle = C.bg;
    ctx.strokeText(n.name, n.x, y);
    ctx.fillStyle = focus || n.type === "modality" ? C.text : C["text-2"];
    ctx.fillText(n.name, n.x, y);
  }
  ctx.restore();
}

// ------------------------------------------------------------------- links ---
const endId = (end) => (typeof end === "object" ? end.id : end);
function linkLit(l) {
  const focus = state.hovered || state.selected;
  return focus && (endId(l.source) === focus || endId(l.target) === focus);
}
function linkColor(l) {
  if (linkLit(l)) return l.type === "REALLY_WANTS" ? C.magenta : C["link-hi"];
  if (state.highlight) return alpha(C.link, 0.04);
  if (l.type === "REALLY_WANTS") return alpha(C.magenta, 0.55);
  if (l.type === "USES") return alpha(C.link, 0.09);
  return C.link;
}

// ----------------------------------------------------------------- filters ---
function passes(n) {
  const f = n.facets;
  return state.types.has(n.type)
    && (!state.cls || f.class.includes(state.cls))
    && (!state.inv || f.invasiveness.includes(state.inv))
    && (!state.modality || f.modalities.includes(state.modality))
    && (!state.clinical || f.clinical);
}
function applyFilters() {
  const nodes = graph.nodes.filter(passes);
  const ids = new Set(nodes.map((n) => n.id));
  const links = allLinks.filter((l) => ids.has(endId(l.source)) && ids.has(endId(l.target)));
  fg.graphData({ nodes, links });
  if (state.selected && !ids.has(state.selected)) select(null);
  const verified = graph.edges.filter((e) => e.status === "verified").length;
  $("#stats").textContent = `${nodes.length} of ${graph.nodes.length} entities · ${links.length} links · ${verified} of ${graph.edges.length} verified`;
}
function resetFilters() {
  Object.assign(state, { types: new Set(Object.keys(TYPES)), cls: "", inv: "", modality: "", clinical: false });
  setSeg("#f-class", ""); setSeg("#f-inv", "");
  $("#f-modality").value = ""; $("#f-clinical").checked = false;
  renderLegend();
}

function setSeg(sel, value) {
  document.querySelectorAll(`${sel} button`).forEach((b) => b.setAttribute("aria-checked", b.dataset.v === value));
}
function bindSeg(sel, onChange) {
  document.querySelectorAll(`${sel} button`).forEach((b) => b.addEventListener("click", () => {
    setSeg(sel, b.dataset.v); onChange(b.dataset.v);
  }));
}

function renderLegend() {
  const counts = {};
  graph.nodes.forEach((n) => { counts[n.type] = (counts[n.type] || 0) + 1; });
  const typeColor = (t) => (state.lens === "type" ? C[TYPES[t].color] : C["text-2"]);
  $("#types").replaceChildren(...Object.entries(TYPES).map(([t, meta]) => el("li", {},
    el("button", {
      ariaPressed: String(state.types.has(t)),
      onclick: () => { state.types.has(t) ? state.types.delete(t) : state.types.add(t); renderLegend(); applyFilters(); },
    }, glyph(meta.shape, typeColor(t)), meta.label, el("span", { className: "n", textContent: counts[t] || 0 })))));
  const key = $("#legend");
  if (state.lens === "type") {
    key.replaceChildren(
      el("li", { className: "static" }, glyph("circle", C.teal, true), "Proposed, not yet built"));
  } else {
    const lens = LENSES[state.lens];
    const both = el("span", { className: "glyph" });
    both.innerHTML = `<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><path d="M7 1.5a5.5 5.5 0 000 11z" fill="${C[lens.values[0][2]]}"/><path d="M7 1.5a5.5 5.5 0 010 11z" fill="${C[lens.values[1][2]]}"/></svg>`;
    key.replaceChildren(
      ...lens.values.map(([, label, c]) => el("li", { className: "static" }, glyph("circle", C[c]), label)),
      el("li", { className: "static" }, both, "Both"),
      el("li", { className: "static" }, glyph("circle", C.neutral), "Not applicable"));
  }
}

// --------------------------------------------------------------- selection ---
function neighbourhood(id) {
  return new Set([id, ...(adjacency[id] || [])]);
}
function refreshHighlight() {
  const focus = state.hovered || state.selected;
  state.highlight = focus ? neighbourhood(focus) : null;
}
function select(id, { fly = false } = {}) {
  if (id && !passes(byId[id])) { resetFilters(); applyFilters(); }
  state.selected = id;
  refreshHighlight();
  renderDetail();
  try { history.replaceState(null, "", id ? `#${id}` : location.pathname + location.search); } catch (e) { /* file:// */ }
  if (id && fly) {
    showView("network");
    const n = byId[id];
    if (Number.isFinite(n.x)) { fg.centerAt(n.x, n.y, 700); fg.zoom(Math.max(fg.zoom(), 2), 700); }
  }
}

function nodeButton(id) {
  return el("button", { className: "link", textContent: byId[id].name, onclick: () => select(id, { fly: true }) });
}
function linkList(ids) {
  const frag = document.createDocumentFragment();
  ids.forEach((id, i) => frag.append(i ? ", " : "", nodeButton(id)));
  return ids.length ? frag : "–";
}

function renderDetail() {
  const panel = $("#detail");
  const n = state.selected && byId[state.selected];
  panel.hidden = !n;
  if (!n) return;
  const f = n.facets;
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const chips = [
    ...(n.type === "problem" ? [] : [...f.class.map(cap), ...f.invasiveness.map(cap)]),
    f.clinical && n.type !== "problem" && "Clinical", n.layer && cap(n.layer), n.status === "proposed" && "Proposed", ...(n.tags || []).map(cap),
  ].filter(Boolean);
  const repo = n.repo
    ? el("a", { className: "repo", href: `https://github.com/${n.repo}`, target: "_blank", rel: "noopener" })
    : n.url ? el("a", { className: "repo", href: n.url, target: "_blank", rel: "noopener", textContent: n.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") }) : null;
  if (n.repo) {
    repo.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="4.5" cy="3.5" r="1.7"/><circle cx="4.5" cy="12.5" r="1.7"/><circle cx="11.5" cy="5.5" r="1.7"/><path d="M4.5 5.2v5.6M11.5 7.2c0 2.3-7 1.3-7 3.6"/></svg>';
    repo.append(el("span", { textContent: n.repo }));
  }
  panel.replaceChildren(
    el("button", { className: "icon close", textContent: "✕", ariaLabel: "Close details", onclick: () => select(null) }),
    el("div", { className: "kind" }, glyph(TYPES[n.type].shape, C[TYPES[n.type].color], isHollow(n)), typeLabel(n)),
    el("h2", { className: "name", textContent: n.name }),
    chips.length ? el("div", { className: "chips" }, ...chips.map((c) => el("span", { className: "tag", textContent: c }))) : null,
    el("p", { textContent: n.description }),
    repo);

  const groups = new Map();
  graph.edges.forEach((e) => {
    const out = e.from === n.id, inc = e.to === n.id;
    if (!out && !inc) return;
    const label = REL[e.type][out ? 0 : 1];
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push([out ? e.to : e.from, e]);
  });
  for (const [label, items] of groups) {
    items.sort((a, b) => byId[a[0]].name.localeCompare(byId[b[0]].name));
    panel.append(
      el("h3", { textContent: `${label} · ${items.length}` }),
      el("ul", { className: "rel" }, ...items.map(([other, e]) => {
        const tags = [e.coverage, e.stage, CLAIM_EDGES.has(e.type) && e.status === "unverified" && "unverified"].filter(Boolean);
        return el("li", {}, nodeButton(other),
          ...tags.flatMap((t) => [" ", el("span", { className: "tag", textContent: t })]),
          e.note ? el("div", { className: "note", textContent: e.note }) : null);
      })));
  }
  panel.scrollTop = 0;
}

// -------------------------------------------------------------------- gaps ---
function renderGaps() {
  $("#gap-count").textContent = graph.bounties.length;
  $("#bounties").replaceChildren(...graph.bounties.map((b) => {
    const dl = el("dl");
    const row = (label, value) => dl.append(el("dt", { textContent: label }), el("dd", {}, value));
    const unverified = b.wanted_by.length - b.verified_wants;
    row("Wanted by", el("span", {}, linkList(b.wanted_by),
      unverified ? " " : null, unverified ? el("span", { className: "tag", textContent: `${unverified} unverified` }) : null));
    if (b.endorsed_by.length) row("Endorsed by", b.endorsed_by.join(", "));
    row("Unlocks", el("span", {}, linkList(b.unlocks)));
    row("Partial solutions", el("span", {}, linkList(b.partial_solutions.map((s) => s.id))));
    return el("article", { className: "bounty" },
      el("div", { className: "score" }, String(b.score), el("small", { textContent: "score" })),
      el("h3", {}, nodeButton(b.id), " ", el("span", { className: "tag", textContent: b.kind })),
      el("p", { textContent: b.description }), dl);
  }));
}
function showView(view) {
  $("#gaps").hidden = view !== "gaps";
  document.querySelectorAll("nav button").forEach((b) => b.setAttribute("aria-selected", b.dataset.view === view));
}

// ------------------------------------------------------------------ search ---
function bindSearch() {
  const input = $("#search"), list = $("#results");
  let hits = [], active = 0;
  const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); };
  const choose = (n) => { input.value = ""; close(); input.blur(); select(n.id, { fly: true }); };
  const render = () => {
    list.replaceChildren(...hits.map((n, i) => el("li", {
      role: "option", ariaSelected: String(i === active), onmousedown: (e) => { e.preventDefault(); choose(n); },
    }, el("span", { textContent: n.name }), el("small", { textContent: typeLabel(n) }))));
    list.hidden = !hits.length; input.setAttribute("aria-expanded", String(!!hits.length));
  };
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    const score = (n) => {
      const name = n.name.toLowerCase();
      if (name.startsWith(q) || n.id.startsWith(q)) return 0;
      if (name.includes(q)) return 1;
      return (n.repo || "").toLowerCase().includes(q) || n.id.includes(q) ? 2 : 9;
    };
    hits = q ? graph.nodes.map((n) => [score(n), n]).filter(([s]) => s < 9)
      .sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, 8).map(([, n]) => n) : [];
    active = 0; render();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % Math.max(hits.length, 1); render();
    } else if (e.key === "Enter" && hits[active]) choose(hits[active]);
    else if (e.key === "Escape") { input.value = ""; hits = []; close(); }
  });
  input.addEventListener("blur", close);
}

// -------------------------------------------------------------------- init ---
function initGraph() {
  const degree = {};
  graph.edges.forEach((e) => {
    degree[e.from] = (degree[e.from] || 0) + 1; degree[e.to] = (degree[e.to] || 0) + 1;
    (adjacency[e.from] ||= new Set()).add(e.to); (adjacency[e.to] ||= new Set()).add(e.from);
  });
  graph.nodes.forEach((n) => { n.r = TYPES[n.type].base + 1.5 * Math.sqrt(degree[n.id] || 0); });
  graph.nodes.filter((n) => n.type === "project").sort((a, b) => (degree[b.id] || 0) - (degree[a.id] || 0))
    .slice(0, 14).forEach((n) => { n.hub = true; });
  allLinks = graph.edges.map((e) => ({ source: e.from, target: e.to, type: e.type }));

  fg = new ForceGraph($("#graph"))
    .backgroundColor("rgba(0,0,0,0)")
    .nodeId("id").nodeVal((n) => n.r * n.r)
    .nodeLabel((n) => `${esc(n.name)}<small>${esc(typeLabel(n))}</small>`)
    .nodeCanvasObject(drawNode)
    .nodePointerAreaPaint((n, color, ctx) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 3, 0, 2 * Math.PI); ctx.fill(); })
    .linkColor(linkColor)
    .linkWidth((l) => (linkLit(l) ? 1.6 : l.type === "REALLY_WANTS" ? 1.1 : 0.6))
    .linkLineDash((l) => (l.type === "REALLY_WANTS" ? [3, 2.5] : null))
    .linkDirectionalArrowLength((l) => (linkLit(l) ? 4.5 : l.type === "USES" ? 0 : 2.2))
    .linkDirectionalArrowRelPos(1)
    .linkDirectionalParticles((l) => (linkLit(l) ? 2 : 0))
    .linkDirectionalParticleWidth(2.6)
    .linkDirectionalParticleSpeed(0.007)
    .linkDirectionalParticleColor((l) => (l.type === "REALLY_WANTS" ? C.magenta : C.text))
    .autoPauseRedraw(false)
    .warmupTicks(140).cooldownTicks(260).d3VelocityDecay(0.32)
    .onNodeHover((n) => { state.hovered = n ? n.id : null; refreshHighlight(); $("#graph").style.cursor = n ? "pointer" : ""; })
    .onNodeClick((n) => select(n.id, { fly: true }))
    .onBackgroundClick(() => select(null));
  fg.d3Force("charge").strength(-260).distanceMax(600);
  // Gentle pull to the centre so disconnected clusters stay in frame.
  let simNodes = [];
  const gravity = (a) => simNodes.forEach((n) => { n.vx -= n.x * 0.075 * a; n.vy -= n.y * 0.075 * a; });
  gravity.initialize = (ns) => { simNodes = ns; };
  fg.d3Force("gravity", gravity);
  fg.d3Force("link").distance((l) => LINK_DISTANCE[l.type] || 60);

  const resize = () => fg.width(window.innerWidth).height(window.innerHeight);
  window.addEventListener("resize", resize); resize();
  applyFilters();
  const fit = (ms) => fg.zoomToFit(ms, window.innerWidth < 820 ? 30 : 70);
  setTimeout(() => { fit(0); const start = location.hash.slice(1); if (byId[start]) select(start, { fly: true }); }, 60);
  $("#fit").addEventListener("click", () => fit(600));
}

function init(data) {
  graph = data;
  byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
  readTheme();

  const groups = {};
  graph.nodes.filter((n) => n.type === "modality").forEach((m) => {
    const label = `${m.class.length > 1 ? "Sensing and modulating" : m.class[0][0].toUpperCase() + m.class[0].slice(1)}, ${m.invasiveness}`;
    (groups[label] ||= []).push(m);
  });
  for (const [label, items] of Object.entries(groups)) {
    $("#f-modality").append(el("optgroup", { label }, ...items.map((m) => el("option", { value: m.id, textContent: m.name }))));
  }

  renderLegend(); renderGaps(); bindSearch();
  if (typeof ForceGraph === "undefined") { $("#graph").textContent = "The graph library failed to load."; return; }
  initGraph();

  bindSeg("#lens", (v) => { state.lens = v; renderLegend(); });
  bindSeg("#f-class", (v) => { state.cls = v; applyFilters(); });
  bindSeg("#f-inv", (v) => { state.inv = v; applyFilters(); });
  $("#f-modality").addEventListener("change", (e) => { state.modality = e.target.value; applyFilters(); });
  $("#f-clinical").addEventListener("change", (e) => { state.clinical = e.target.checked; applyFilters(); });
  document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
  $("#filters-toggle").addEventListener("click", (e) => {
    e.currentTarget.setAttribute("aria-expanded", e.currentTarget.getAttribute("aria-expanded") !== "true");
  });
  $("#theme").addEventListener("click", () => {
    const root = document.documentElement;
    const current = root.dataset.theme || "dark";
    root.dataset.theme = current === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (e) { /* private mode */ }
    readTheme(); renderLegend(); renderDetail();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.activeElement !== $("#search")) { $("#gaps").hidden ? select(null) : showView("network"); }
    if (e.key === "/" && document.activeElement.tagName !== "INPUT") { e.preventDefault(); $("#search").focus(); }
  });
  if (location.hash === "#gaps") showView("gaps");
}

try { const saved = localStorage.getItem("theme"); if (saved) document.documentElement.dataset.theme = saved; } catch (e) { /* private mode */ }
fetch("graph.json").then((r) => r.json()).then(init).catch((err) => {
  console.error(err);
  $("#graph").textContent = "Could not load graph.json. Run: python tools/ntgraph.py build";
});
})();

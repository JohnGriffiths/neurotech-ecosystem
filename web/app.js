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
  lens: "type", types: new Set(Object.keys(TYPES)), cls: "", inv: "", modality: "", clinical: false, connected: true,
  selected: null, hovered: null, highlight: null, mode: "3d", rotate: true, layout: "network", labels: false,
};
const ref = {}; // reference geometry loaded on demand: ref.world (map outlines), ref.brain (template surface)
const GLOBE_R = 230, MAP_K = 2.2;                       // globe radius; degrees-to-units scale of the flat map
const BRAIN_CENTRE = [0, 15, 18];                        // middle of the brain in scene units (MNI 0,-18,15)
const toScene = (m) => [m[0], m[2], -m[1]];             // MNI (x right, y anterior, z superior) -> scene (y up)
const llToVec = (lat, lng, R) => {
  const a = (lat * Math.PI) / 180, b = (lng * Math.PI) / 180;
  return [R * Math.cos(a) * Math.sin(b), R * Math.sin(a), R * Math.cos(a) * Math.cos(b)];
};
const LAYOUT_NOTE = {
  network: "",
  map: "Organisations pinned to their headquarters or main site. Where only the country is known the pin sits at the centre of its cities.",
  brain: "Devices at the place in the brain where they typically sample or act, in MNI space. Approximate; user-placed devices show a common montage.",
};
let graph, byId, view = null, C = {}, adjacency = {}, allLinks = [];

// ------------------------------------------------------------------ colour ---
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ["bg-glow", "teal", "yellow", "magenta", "violet", "neutral", "text", "text-2", "bg", "link", "link-hi"]) {
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

/** Pins in the Map and Brain layouts shrink as you zoom in, so they stay points and the geography shows through. */
function pinScale2d(scale) { return Math.max(0.1, Math.min(1, 1.2 * Math.pow(scale, -1.3))); }

function drawNode(n, ctx, scale) {
  const r = state.layout === "network" ? n.r : n.r * pinScale2d(scale);
  const { shape } = TYPES[n.type];
  const colors = nodeColors(n);
  const lit = isLit(n);
  const focus = n.id === state.selected || n.id === state.hovered;
  ctx.save();
  ctx.globalAlpha = lit ? 1 : 0.1;
  shapePath(ctx, shape, n.x, n.y, r);
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
      ctx.fillStyle = colors[1]; ctx.fillRect(n.x, n.y - r * 2, r * 2, r * 4);
      ctx.restore();
    }
  }
  if (focus) {
    shapePath(ctx, shape, n.x, n.y, r + 2.2 / scale + 1);
    ctx.lineWidth = 1.5 / scale; ctx.strokeStyle = C.text; ctx.stroke();
  }
  // Labels: hubs first, more as you zoom in; always for the lit neighbourhood.
  const always = focus || (state.highlight && lit) || n.type === "modality" || n.hub || state.layout === "brain" || state.labels;
  if (lit && (always || r * scale > 8.5)) {
    const size = (focus ? 13 : 11) / scale;
    ctx.font = `${focus || n.type === "modality" ? 600 : 400} ${size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    const y = n.y + r * 1.25 + 2 / scale;
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
  const k = state.mode === "3d" ? 2 : 1; // 1px WebGL lines read fainter than canvas strokes
  if (linkLit(l)) return l.type === "REALLY_WANTS" ? C.magenta : C["link-hi"];
  if (state.highlight) return alpha(C.link, 0.04 * k);
  if (l.type === "REALLY_WANTS") return alpha(C.magenta, 0.55);
  if (l.type === "USES") return alpha(C.link, 0.09 * k);
  return alpha(C.link, 0.17 * k);
}

// ----------------------------------------------------------------- filters ---
/** Does the node have a place in the current layout? Map needs a location, Brain needs brain sites. */
function inLayout(n) {
  return state.layout === "map" ? !!n.geo : state.layout === "brain" ? !!n.brain : true;
}
function passes(n) {
  const f = n.facets;
  return state.types.has(n.type)
    && inLayout(n)
    && (state.layout !== "network" || !state.connected || n.deg > 0)
    && (!state.cls || f.class.includes(state.cls))
    && (!state.inv || f.invasiveness.includes(state.inv))
    && (!state.modality || f.modalities.includes(state.modality))
    && (!state.clinical || f.clinical);
}
function applyFilters() {
  const nodes = graph.nodes.filter(passes);
  const ids = new Set(nodes.map((n) => n.id));
  const links = state.layout !== "network" ? [] : allLinks.filter((l) => ids.has(endId(l.source)) && ids.has(endId(l.target)));
  view.setData({ nodes, links });
  state.touched = false;
  if (state.selected && !ids.has(state.selected)) select(null);
  const verified = graph.edges.filter((e) => e.status === "verified").length;
  const loose = graph.nodes.filter((n) => !n.deg).length;
  const placeable = graph.nodes.filter(inLayout).length;
  $("#stats").textContent = state.layout === "network"
    ? `${nodes.length} of ${graph.nodes.length} entities · ${links.length} links · ${verified} of ${graph.edges.length} verified`
      + (state.connected && loose ? ` · ${loose} unconnected hidden` : "")
    : `${nodes.length} of ${placeable} ${state.layout === "map" ? "organisations on the map" : "devices with a brain site"}`
      + ` · ${graph.nodes.length - placeable} have no ${state.layout === "map" ? "location" : "site"}`;
}
function resetFilters() {
  Object.assign(state, { types: new Set(Object.keys(TYPES)), cls: "", inv: "", modality: "", clinical: false, connected: false });
  $("#f-connected").checked = false;
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
  // Connections only matter in the abstract network; Map and Brain show positions, so nothing is dimmed.
  state.highlight = focus && state.layout === "network" ? neighbourhood(focus) : null;
  if (view) view.restyle();
}
function select(id, { fly = false } = {}) {
  if (id && !inLayout(byId[id])) applyLayout("network");
  if (id && !passes(byId[id])) { resetFilters(); applyFilters(); }
  state.selected = id;
  refreshHighlight();
  renderDetail();
  try { history.replaceState(null, "", id ? `#${id}` : location.pathname + location.search); } catch (e) { /* file:// */ }
  if (id && fly) {
    showView("network");
    if (state.rotate) setRotate(false);
    if (Number.isFinite(byId[id].x)) view.focus(byId[id]);
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
    f.clinical && n.type !== "problem" && "Clinical", n.layer && cap(n.layer), n.status === "proposed" && "Proposed",
    n.type === "org" && n.status && n.status !== "unknown" && cap(n.status), n.city, n.country,
    ...(n.tags || []).slice(0, 8).map(cap),
  ].filter(Boolean);
  const SOURCES = { "ntx-ecosystem-2022": "NeuroTechX ecosystem database, 2022 snapshot" };
  const provenance = n.source || n.checked
    ? el("p", { className: "provenance", textContent: [
        n.source && `Source: ${SOURCES[n.source] || n.source}.`,
        n.checked ? `Last checked ${n.checked}; may be out of date.` : "Never checked.",
      ].filter(Boolean).join(" ") })
    : null;
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
    ...[provenance, repo].filter(Boolean));
  if (n.geo) {
    panel.append(el("p", { className: "provenance", textContent: n.geo.precision === "city"
      ? "Map position: its city (approximate)." : "Map position: the centre of its country; the city is not known." }));
  }
  if (n.brain) {
    panel.append(
      el("h3", { textContent: `Typical sites · ${n.brain.length}` }),
      el("ul", { className: "rel" }, ...n.brain.map((site) => el("li", {},
        site.label, " ", el("span", { className: "tag", textContent: `MNI ${site.mni.join(", ")}` })))),
      el("p", { className: "provenance", textContent: "Positions are approximate (about 5 to 10 mm) and unverified." }));
  }

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

// --------------------------------------------------------------- renderers ---
// Two interchangeable views of the same data: { fg, setData, restyle, focus, fit, resize, destroy }.

/** Scene position of the pin for each node in the current layout; `null` outside network layout. */
function layoutPosition(n, three) {
  const point = state.layout === "map" ? n.geo : state.layout === "brain" ? n.brain && n.brain[0] : null;
  if (!point) return null;
  if (state.layout === "map") return three ? llToVec(point.lat, point.lng, GLOBE_R) : [point.lng * MAP_K, -point.lat * MAP_K];
  return three ? toScene(point.mni) : [point.mni[0], -point.mni[1]];
}

/** Pin nodes to their place in the Map or Brain layout, fanning out those that share one spot. */
function pinNodes() {
  const three = state.mode === "3d";
  graph.nodes.forEach((n) => { delete n.fx; delete n.fy; delete n.fz; n.r = state.layout === "network" ? n.r0 : state.layout === "map" ? 1.7 : 3.4; });
  if (state.layout === "network") return;
  const groups = new Map();
  graph.nodes.forEach((n) => {
    const at = layoutPosition(n, three);
    if (!at) return;
    const key = at.map((v) => Math.round(v * 10)).join(",");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  });
  const gap = state.layout === "map" ? 5.2 : 8.5;
  const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const items of groups.values()) {
    items.sort((a, b) => (a.id < b.id ? -1 : 1));
    const base = layoutPosition(items[0], three);
    // Tangent plane at the pin: on the globe or around the brain, perpendicular to the radius.
    let east, north;
    if (three) {
      const centre = state.layout === "map" ? [0, 0, 0] : BRAIN_CENTRE;
      const radial = norm(base.map((v, i) => v - centre[i]));
      east = norm(cross(Math.abs(radial[1]) > 0.98 ? [1, 0, 0] : [0, 1, 0], radial));
      north = cross(radial, east);
    }
    items.forEach((n, i) => {
      const r = items.length === 1 ? 0 : gap * Math.sqrt(i + 0.35), a = i * 2.39996;
      const dx = r * Math.cos(a), dy = r * Math.sin(a);
      let pos;
      if (!three) pos = [base[0] + dx, base[1] + dy];
      else {
        pos = base.map((v, k) => v + east[k] * dx + north[k] * dy);
        if (state.layout === "map") pos = norm(pos).map((v) => v * GLOBE_R); // stay on the sphere
      }
      [n.fx, n.fy, n.fz] = pos; [n.x, n.y, n.z] = pos;
      if (!three) { delete n.fz; n.z = 0; }
    });
  }
}

/** Default camera direction for a layout (3D). `undefined` keeps the current one. */
function layoutDirection() {
  if (state.layout === "map") return llToVec(32, -35, 1);
  if (state.layout === "brain") return [-0.8, 0.5, -1];
  return undefined;
}

// A two-finger pinch must not select whatever is under the fingers when they lift.
const touches = new Set();
let pinchUntil = 0;
const pinching = () => touches.size > 1 || performance.now() < pinchUntil;
function trackTouches(el) {
  el.addEventListener("pointerdown", (e) => { touches.add(e.pointerId); if (touches.size > 1) pinchUntil = performance.now() + 600; }, true);
  const lift = (e) => { if (touches.size > 1) pinchUntil = performance.now() + 600; touches.delete(e.pointerId); };
  el.addEventListener("pointerup", lift, true);
  el.addEventListener("pointercancel", lift, true);
}

/** Gentle pull to the centre so disconnected clusters stay in frame. */
function gravityForce(k, dims) {
  let nodes = [];
  const force = (a) => nodes.forEach((n) => {
    n.vx -= n.x * k * a; n.vy -= n.y * k * a;
    if (dims === 3) n.vz -= n.z * k * a;
  });
  force.initialize = (ns) => { nodes = ns; };
  return force;
}

function commonSetup(fg, dims) {
  fg.nodeId("id")
    .nodeLabel((n) => `${esc(n.name)}<small>${esc(typeLabel(n))}</small>`)
    .linkColor(linkColor)
    .linkDirectionalArrowRelPos(1)
    .linkDirectionalParticles((l) => (linkLit(l) ? 2 : 0))
    .linkDirectionalParticleSpeed(0.007)
    .linkDirectionalParticleColor((l) => (l.type === "REALLY_WANTS" ? C.magenta : C.text))
    .d3VelocityDecay(0.32)
    .onNodeHover((n) => { state.hovered = n ? n.id : null; refreshHighlight(); $("#graph").style.cursor = n ? "pointer" : ""; })
    .onNodeClick((n) => { if (!pinching()) select(n.id, { fly: true }); })
    .onBackgroundClick(() => { if (!pinching()) select(null); });
  fg.d3Force("gravity", gravityForce(dims === 3 ? 0.06 : 0.075, dims));
  fg.d3Force("link").distance((l) => LINK_DISTANCE[l.type] || 60);
  return fg;
}

/** Flat map outlines, or the axial head outline with the extra sites of multi-site devices. */
function drawBackdrop2d(ctx, scale) {
  if (state.layout === "map" && ref.world) {
    const trace = (lines) => {
      ctx.beginPath();
      for (const line of lines) line.forEach(([lng, lat], i) => ctx[i ? "lineTo" : "moveTo"](lng * MAP_K, -lat * MAP_K));
    };
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineWidth = 0.8 / scale; ctx.strokeStyle = alpha(C["text-2"], 0.16); trace(ref.world.borders); ctx.stroke();
    ctx.lineWidth = 1.1 / scale; ctx.strokeStyle = alpha(C["text-2"], 0.5); trace(ref.world.coast); ctx.stroke();
    ctx.restore();
  } else if (state.layout === "brain" && ref.brain) {
    ctx.save();
    ctx.beginPath();
    ref.brain.outline.axial.forEach(([x, y], i) => ctx[i ? "lineTo" : "moveTo"](x, -y));
    ctx.closePath();
    ctx.fillStyle = alpha(C.teal, 0.06); ctx.fill();
    ctx.lineWidth = 1.4 / scale; ctx.strokeStyle = alpha(C["text-2"], 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -75); ctx.lineTo(0, 78);           // midline
    ctx.moveTo(-72, 0); ctx.lineTo(72, 0);                              // coronal plane through the anterior commissure
    ctx.lineWidth = 0.6 / scale; ctx.strokeStyle = alpha(C["text-2"], 0.16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-9, -88); ctx.lineTo(0, -100); ctx.lineTo(9, -88); ctx.closePath();
    ctx.fillStyle = alpha(C["text-2"], 0.5); ctx.fill();                // nose: anterior is up
    for (const n of view ? view.fg.graphData().nodes : []) {
      if (!n.brain || n.brain.length < 2 || !isLit(n)) continue;
      ctx.beginPath();
      for (const site of n.brain.slice(1)) { ctx.moveTo(n.x, n.y); ctx.lineTo(site.mni[0], -site.mni[1]); }
      ctx.lineWidth = 0.6 / scale; ctx.strokeStyle = alpha(nodeColors(n)[0], 0.4); ctx.stroke();
      ctx.fillStyle = alpha(nodeColors(n)[0], 0.8);
      for (const site of n.brain.slice(1)) { ctx.beginPath(); ctx.arc(site.mni[0], -site.mni[1], 1.6, 0, 2 * Math.PI); ctx.fill(); }
    }
    ctx.restore();
  }
}

function make2d(container) {
  const fg = commonSetup(new ForceGraph(container), 2)
    .backgroundColor("rgba(0,0,0,0)")
    .nodeVal((n) => n.r * n.r)
    .nodeCanvasObject(drawNode)
    .nodePointerAreaPaint((n, color, ctx, scale) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(n.x, n.y, (state.layout === "network" ? n.r : n.r * pinScale2d(scale)) + 3 / scale, 0, 2 * Math.PI); ctx.fill(); })
    .linkWidth((l) => (linkLit(l) ? 1.6 : l.type === "REALLY_WANTS" ? 1.1 : 0.6))
    .linkLineDash((l) => (l.type === "REALLY_WANTS" ? [3, 2.5] : null))
    .linkDirectionalArrowLength((l) => (linkLit(l) ? 4.5 : l.type === "USES" ? 0 : 2.2))
    .linkDirectionalParticleWidth(2.6)
    .autoPauseRedraw(false)
    .minZoom(0.2).maxZoom(80)
    .onRenderFramePre((ctx, scale) => drawBackdrop2d(ctx, scale))
    .warmupTicks(140).cooldownTicks(260);
  fg.d3Force("charge").strength(-260).distanceMax(600);
  return {
    fg,
    setData: (d) => fg.graphData(d),
    setLayout: () => {}, // the canvas backdrop is drawn from state every frame
    restyle: () => {}, // the canvas redraws from state every frame
    focus: (n) => { fg.centerAt(n.x, n.y, 700); fg.zoom(Math.max(fg.zoom(), 2), 700); },
    fit: (ms) => fg.zoomToFit(ms, window.innerWidth < 820 ? 30 : 70),
    resize: () => fg.width(window.innerWidth).height(window.innerHeight),
    setRotate: () => {},
    zoom: { min: 0.2, max: 80, get: () => fg.zoom(), set: (k, ms = 0) => fg.zoom(k, ms) },
    destroy: () => { fg._destructor(); container.replaceChildren(); },
  };
}

function make3d(container) {
  const { ForceGraph3D, SpriteText, THREE: T } = window.NTX3D;
  // Solid counterparts of the 2D glyphs: sphere, cube, faceted gem, pyramid, octahedron.
  const geometry = {
    circle: new T.SphereGeometry(1, 24, 16), square: new T.BoxGeometry(1.5, 1.5, 1.5),
    hexagon: new T.IcosahedronGeometry(1.2, 0), triangle: new T.ConeGeometry(1.15, 1.9, 4),
    diamond: new T.OctahedronGeometry(1.3),
  };
  geometry["triangle-down"] = geometry.triangle;

  const canvasTexture = (w, h, paint) => {
    const c = Object.assign(document.createElement("canvas"), { width: w, height: h });
    paint(c.getContext("2d"));
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  };
  const stripes = new Map();
  /** Two-colour texture for an entity that spans both values of the active lens. */
  const striped = (a, b) => {
    const key = a + b;
    if (!stripes.has(key)) {
      stripes.set(key, canvasTexture(256, 2, (ctx) => [a, b, a, b].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * 64, 0, 64, 2); })));
    }
    return stripes.get(key);
  };
  const haloTexture = canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,.75)"); g.addColorStop(0.35, "rgba(255,255,255,.22)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  });

  function build(n) {
    const hollow = isHollow(n);
    const material = hollow
      ? new T.MeshBasicMaterial({ wireframe: true, transparent: true })
      : new T.MeshLambertMaterial({ transparent: true });
    const mesh = new T.Mesh(geometry[TYPES[n.type].shape], material);
    mesh.scale.setScalar(n.r * 0.85);
    if (TYPES[n.type].shape === "triangle-down") mesh.rotation.x = Math.PI;
    const group = new T.Group(); group.add(mesh);
    n.__o = { group, mesh, hollow, label: null, holder: null, halo: null, map: null, sites: null };
    if (n.brain && n.brain.length > 1) { // a star from the primary site to the others, shown in the Brain layout
      const first = toScene(n.brain[0].mni), sites = new T.Group(), pts = [];
      const lineMat = new T.LineBasicMaterial({ transparent: true, opacity: 0.45 });
      const dotMat = new T.MeshBasicMaterial({ transparent: true, opacity: 0.85 });
      for (const site of n.brain.slice(1)) {
        const at = toScene(site.mni).map((v, k) => v - first[k]);
        pts.push(0, 0, 0, ...at);
        const dot = new T.Mesh(geometry.circle, dotMat); dot.scale.setScalar(1.7); dot.position.set(...at); dot.raycast = () => {};
        sites.add(dot);
      }
      const lines = new T.BufferGeometry(); lines.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
      const star = new T.LineSegments(lines, lineMat); star.raycast = () => {};
      sites.add(star); group.add(sites);
      n.__o.sites = { group: sites, lineMat, dotMat };
    }
    style(n);
    return group;
  }

  function style(n) {
    const o = n.__o;
    if (!o) return;
    const colors = nodeColors(n), lit = isLit(n);
    const focus = n.id === state.selected || n.id === state.hovered;
    const m = o.mesh.material, r = n.r * 0.85;
    if (state.layout === "network") o.mesh.scale.setScalar(r);
    const map = colors[1] && !o.hollow ? striped(colors[0], colors[1]) : null;
    if (map !== o.map) { m.map = map; o.map = map; m.needsUpdate = true; }
    m.color.set(map ? "#ffffff" : colors[0]);
    m.opacity = lit ? 1 : 0.06; m.depthWrite = lit;

    if (o.sites) {
      o.sites.group.visible = state.layout === "brain" && lit;
      o.sites.lineMat.color.set(colors[0]); o.sites.dotMat.color.set(colors[0]);
    }
    const strong = focus || n.type === "modality";
    const wanted = lit && (strong || !!state.highlight || n.hub || state.layout === "brain" || state.labels);
    if (wanted && !o.label) {
      o.label = new SpriteText(n.name, 4);
      Object.assign(o.label, { fontFace: "ui-sans-serif, system-ui, sans-serif", strokeWidth: 1.5, padding: 1 });
      o.label.material.depthWrite = false; o.label.renderOrder = 2;
      o.holder = new T.Group(); o.holder.add(o.label); // scaled each frame to keep the text legible
      o.group.add(o.holder);
    }
    if (o.label) {
      o.label.visible = wanted;
      if (wanted) {
        const want = { color: strong ? C.text : C["text-2"], strokeColor: C.bg, textHeight: (focus ? 5.4 : 4) * (state.layout === "brain" ? 0.75 : 1), fontWeight: strong ? "600" : "400" };
        for (const [k, v] of Object.entries(want)) if (o.label[k] !== v) o.label[k] = v; // each set re-rasterises
        o.gap = r * 1.35; o.rise = want.textHeight * 0.85;
      }
    }
    if (focus && !o.halo) {
      o.halo = new T.Sprite(new T.SpriteMaterial({ map: haloTexture, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
      o.halo.scale.setScalar(r * 7); o.halo.raycast = () => {};
      o.group.add(o.halo);
    }
    if (o.halo) { o.halo.visible = focus; o.halo.material.color.set(colors[0]); }
  }

  const fg = commonSetup(new ForceGraph3D(container, { controlType: "orbit", rendererConfig: { antialias: true, alpha: true } }), 3)
    .backgroundColor("rgba(0,0,0,0)").showNavInfo(false)
    .nodeThreeObject(build)
    .linkOpacity(1)
    .linkWidth((l) => (linkLit(l) ? 0.5 : 0))
    .linkDirectionalArrowLength((l) => (linkLit(l) ? 4 : 0))
    .linkDirectionalParticleWidth(1.6)
    .warmupTicks(120).cooldownTicks(240);
  fg.d3Force("charge").strength(-150).distanceMax(500);
  const controls = fg.controls();
  Object.assign(controls, { minDistance: 18, maxDistance: 3000, enableDamping: true, dampingFactor: 0.12, autoRotateSpeed: 0.6, autoRotate: state.rotate });
  const fog = fg.scene().fog = new T.Fog(C.bg, 1, 4000); // depth cue: far nodes fade into the background
  let radius = 400, alive = true, backdrop = null;

  /** A globe with coastlines and borders, or the template brain, drawn behind the pinned nodes. */
  function buildBackdrop(layout) {
    if (layout === "map" && ref.world) {
      const group = new T.Group();
      const sphere = new T.Mesh(new T.SphereGeometry(GLOBE_R - 1.5, 64, 40), new T.MeshBasicMaterial({ color: C["bg-glow"] }));
      sphere.renderOrder = -2; group.add(sphere);
      const lines = (polylines, key) => {
        const pts = [];
        for (const line of polylines) {
          for (let i = 1; i < line.length; i++) {
            const [lng0, lat0] = line[i - 1], [lng1, lat1] = line[i];
            const steps = Math.max(1, Math.ceil(Math.max(Math.abs(lng1 - lng0), Math.abs(lat1 - lat0)) / 2)); // follow the curve
            for (let k = 0; k < steps; k++) {
              pts.push(...llToVec(lat0 + ((lat1 - lat0) * k) / steps, lng0 + ((lng1 - lng0) * k) / steps, GLOBE_R),
                       ...llToVec(lat0 + ((lat1 - lat0) * (k + 1)) / steps, lng0 + ((lng1 - lng0) * (k + 1)) / steps, GLOBE_R));
            }
          }
        }
        const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
        const mesh = new T.LineSegments(geo, new T.LineBasicMaterial({ transparent: true }));
        mesh.userData.key = key; mesh.raycast = () => {}; group.add(mesh);
      };
      lines(ref.world.borders, "borders"); lines(ref.world.coast, "coast");
      return group;
    }
    if (layout === "brain" && ref.brain) {
      const group = new T.Group();
      const verts = [];
      for (let i = 0; i < ref.brain.mesh.v.length; i += 3) verts.push(...toScene(ref.brain.mesh.v.slice(i, i + 3)));
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.Float32BufferAttribute(verts, 3));
      geo.setIndex(ref.brain.mesh.f); geo.computeVertexNormals();
      const shell = new T.Mesh(geo, new T.MeshLambertMaterial({ transparent: true, opacity: 0.1, side: T.DoubleSide, depthWrite: false }));
      const mesh = new T.Mesh(geo, new T.MeshBasicMaterial({ transparent: true, opacity: 0.07, wireframe: true, depthWrite: false }));
      shell.userData.key = "shell"; mesh.userData.key = "wire";
      shell.raycast = mesh.raycast = () => {};
      group.add(shell, mesh);
      return group;
    }
    return null;
  }
  function paintBackdrop() {
    if (!backdrop) return;
    backdrop.children.forEach((o) => {
      const k = o.userData.key, m = o.material;
      if (k === "coast") { m.color.set(C["text-2"]); m.opacity = 0.55; }
      else if (k === "borders") { m.color.set(C["text-2"]); m.opacity = 0.16; }
      else if (k === "shell") m.color.set(C.teal);
      else if (k === "wire") m.color.set(C["text-2"]);
      else if (m.color) m.color.set(C["bg-glow"]);
    });
  }

  // Per frame: fog tracks the camera, and labels grow with distance so they stay about 12px on screen.
  (function frame() {
    if (!alive) return;
    requestAnimationFrame(frame);
    const cam = fg.camera().position;
    const d = Math.hypot(cam.x, cam.y, cam.z);
    fog.near = Math.max(1, d - radius); fog.far = d + radius * 3.5;
    for (const n of fg.graphData().nodes) {
      const o = n.__o;
      if (o && state.layout !== "network" && Number.isFinite(n.x)) {
        // Zooming in shrinks pins towards points; at the default framing they are full size.
        let pin = Math.max(0.12, Math.min(1, Math.hypot(cam.x - n.x, cam.y - n.y, cam.z - n.z) / (state.layout === "map" ? 560 : 420)));
        if (n.id === state.selected || n.id === state.hovered) pin = Math.max(pin, 0.6);  // keep the one you are looking at visible
        o.mesh.scale.setScalar(n.r * 0.85 * pin);
        o.gap = n.r * 0.85 * pin * 1.35;
        if (o.sites) o.sites.group.scale.setScalar(1);
      }
      if (!o || !o.label || !o.label.visible || !Number.isFinite(n.x)) continue;
      const k = Math.min(6, Math.max(1, Math.hypot(cam.x - n.x, cam.y - n.y, cam.z - n.z) / 420));
      o.holder.scale.setScalar(k);
      o.label.position.y = -(o.gap / k + o.rise);
    }
  })();

  return {
    fg,
    setData: (d) => fg.graphData(d),
    setLayout: (layout) => {
      if (backdrop) { fg.scene().remove(backdrop); backdrop.traverse((o) => { o.geometry && o.geometry.dispose(); }); backdrop = null; }
      backdrop = buildBackdrop(layout);
      if (backdrop) { fg.scene().add(backdrop); paintBackdrop(); }
      fg.graphData().nodes.forEach(style);
    },
    restyle: () => {
      fog.color.set(C.bg);
      paintBackdrop();
      fg.graphData().nodes.forEach(style);
      // Re-setting an accessor makes the library re-evaluate it for every link.
      fg.linkColor(fg.linkColor()).linkWidth(fg.linkWidth())
        .linkDirectionalArrowLength(fg.linkDirectionalArrowLength()).linkDirectionalParticles(fg.linkDirectionalParticles());
    },
    focus: (n) => {
      if (state.layout !== "network") { // look at the pin from outside the globe, or from the side of the brain
        const c = state.layout === "map" ? [0, 0, 0] : BRAIN_CENTRE;
        const dir = [n.x - c[0], n.y - c[1], n.z - c[2]], len = Math.hypot(...dir) || 1;
        const back = state.layout === "map" ? 160 : 190, away = len < 30 ? layoutDirection() : dir.map((v) => v / len);
        const u = Math.hypot(...away) || 1;
        fg.cameraPosition({ x: n.x + (away[0] / u) * back, y: n.y + (away[1] / u) * back, z: n.z + (away[2] / u) * back }, n, 900);
        return;
      }
      const d = Math.hypot(n.x, n.y, n.z) || 1, k = 1 + (window.innerWidth < 820 ? 560 : 300) / d;
      fg.cameraPosition({ x: n.x * k, y: n.y * k, z: n.z * k }, n, 900);
    },
    fit: (ms, dir) => {
      // Frame the bounding sphere of the laid-out nodes, keeping the current viewing direction unless one is given.
      const nodes = fg.graphData().nodes.filter((n) => Number.isFinite(n.x));
      if (!nodes.length) return;
      const c = state.layout === "brain" ? BRAIN_CENTRE : [0, 0, 0];
      radius = Math.max(60, ...nodes.map((n) => Math.hypot(n.x - c[0], n.y - c[1], n.z - c[2]) + n.r));
      if (state.layout === "map") radius = GLOBE_R + 10;
      if (state.layout === "brain") radius = Math.max(radius, 95);   // keep the whole brain in frame
      const cam = fg.camera();
      const vertical = (cam.fov * Math.PI) / 360;
      const half = Math.min(vertical, Math.atan(Math.tan(vertical) * cam.aspect));
      const dist = (radius / Math.sin(half)) * (state.layout === "map" ? 1.2 : state.layout === "brain" ? 1.1 : 0.92);
      const p = dir ? { x: dir[0], y: dir[1], z: dir[2] } : { x: cam.position.x - c[0], y: cam.position.y - c[1], z: cam.position.z - c[2] };
      const len = Math.hypot(p.x, p.y, p.z) || 1;
      fg.cameraPosition({ x: c[0] + (p.x / len) * dist, y: c[1] + (p.y / len) * dist, z: c[2] + (p.z / len) * dist }, { x: c[0], y: c[1], z: c[2] }, ms);
    },
    resize: () => fg.width(window.innerWidth).height(window.innerHeight),
    setRotate: (on) => { controls.autoRotate = on; },
    // Zoom is the inverse of the camera's distance from what it orbits, so larger means closer in both views.
    zoom: {
      min: 1000 / 3000, max: 1000 / 18,
      get: () => 1000 / Math.max(1, fg.camera().position.distanceTo(controls.target)),
      set: (k, ms = 0) => {
        const t = controls.target, p = fg.camera().position, d = 1000 / k;
        const len = Math.max(1e-6, p.distanceTo(t));
        fg.cameraPosition({ x: t.x + ((p.x - t.x) / len) * d, y: t.y + ((p.y - t.y) / len) * d, z: t.z + ((p.z - t.z) / len) * d }, { x: t.x, y: t.y, z: t.z }, ms);
      },
    },
    destroy: () => { alive = false; fg._destructor(); container.replaceChildren(); },
  };
}

/** Switch layout once its reference data is available. Falls back to the network if that cannot be loaded. */
async function setLayout(layout) {
  const note = $("#layout-note");
  try {
    if (layout === "map" && !ref.world) ref.world = await (await fetch("world.json")).json();
    if (layout === "brain" && !ref.brain) ref.brain = await (await fetch("brain.json")).json();
  } catch (err) {
    console.error(err);
    note.textContent = "Could not load the reference data for that layout.";
    layout = "network";
  }
  applyLayout(layout);
}

function applyLayout(layout) {
  state.layout = layout;
  document.body.dataset.layout = layout;
  setSeg("#layout", layout);
  $("#layout-note").textContent = LAYOUT_NOTE[layout];
  $("#layout-note").hidden = !LAYOUT_NOTE[layout];
  pinNodes();
  refreshHighlight();
  view.setLayout(layout);
  state.touched = false;
  applyFilters();
  if (layout !== "network" && state.rotate && layout === "brain") setRotate(false);
  view.fg.d3ReheatSimulation && view.fg.d3ReheatSimulation();
  const mine = view;
  let frames = 0;
  (function settle() {   // wait until the new data has positions, then frame it
    if (view !== mine) return;
    const nodes = view.fg.graphData().nodes;
    if (nodes.length && !Number.isFinite(nodes[0].x) && ++frames < 30) { requestAnimationFrame(settle); return; }
    view.fit(700, layoutDirection());
  })();
}

/** Minus, slider and plus for zooming without pinching. The slider follows pinch and wheel zoom too. */
function bindZoom() {
  const slider = $("#zoom-dial");
  let dragging = false;
  const toT = (k, z) => (100 * Math.log(k / z.min)) / Math.log(z.max / z.min);
  const toK = (t, z) => z.min * Math.pow(z.max / z.min, t / 100);
  const clamp = (k, z) => Math.min(z.max, Math.max(z.min, k));
  const step = (factor) => { state.touched = true; const z = view.zoom; z.set(clamp(z.get() * factor, z), 250); };
  $("#zoom-in").addEventListener("click", () => step(1.5));
  $("#zoom-out").addEventListener("click", () => step(1 / 1.5));
  slider.addEventListener("pointerdown", () => { dragging = true; state.touched = true; });
  slider.addEventListener("pointerup", () => { dragging = false; });
  slider.addEventListener("input", () => { state.touched = true; view.zoom.set(toK(Number(slider.value), view.zoom), 0); });
  (function follow() {
    requestAnimationFrame(follow);
    if (!view || dragging || document.activeElement === slider) return;
    const t = Math.round(toT(clamp(view.zoom.get(), view.zoom), view.zoom));
    if (Number(slider.value) !== t) slider.value = t;
  })();
}

function webglAvailable() {
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch (e) { return false; }
}
function setRotate(on) {
  state.rotate = on;
  $("#rotate").setAttribute("aria-pressed", String(on));
  if (view) view.setRotate(on);
}

/** (Re)create the network in 2D or 3D, falling back to 2D where WebGL is missing. */
function mount(mode) {
  const container = $("#graph");
  if (view) view.destroy();
  graph.nodes.forEach((n) => { for (const k of ["x", "y", "z", "vx", "vy", "vz", "fx", "fy", "fz", "__o"]) delete n[k]; });
  state.hovered = null;
  view = null;
  if (mode === "3d" && window.NTX3D && webglAvailable()) {
    try { state.mode = "3d"; view = make3d(container); } catch (e) { console.warn("3D view unavailable, using 2D", e); container.replaceChildren(); }
  }
  if (!view) { state.mode = "2d"; view = make2d(container); }
  view.resize();
  refreshHighlight();
  pinNodes();
  view.setLayout(state.layout);
  applyFilters();
  setSeg("#dims", state.mode);
  document.body.dataset.mode = state.mode;
  // Frame the graph once the first layout pass has produced positions, then again when it settles.
  const mine = view;
  let frames = 0;
  state.touched = false;
  (function whenLaidOut() {
    if (view !== mine) return;
    const nodes = view.fg.graphData().nodes;
    if (!nodes.length || !Number.isFinite(nodes[0].x) || ++frames < 5) { requestAnimationFrame(whenLaidOut); return; }
    view.fit(0, layoutDirection());
    const start = state.selected || location.hash.slice(1);
    if (byId[start]) select(start, { fly: true });
  })();
  view.fg.onEngineStop(() => { if (view === mine && !state.touched && !state.selected) view.fit(900); });
}

function initGraph() {
  const degree = {};
  graph.edges.forEach((e) => {
    degree[e.from] = (degree[e.from] || 0) + 1; degree[e.to] = (degree[e.to] || 0) + 1;
    (adjacency[e.from] ||= new Set()).add(e.to); (adjacency[e.to] ||= new Set()).add(e.from);
  });
  graph.nodes.forEach((n) => { n.deg = degree[n.id] || 0; n.r0 = TYPES[n.type].base + 1.5 * Math.sqrt(n.deg); n.r = n.r0; });
  graph.nodes.filter((n) => n.type === "project").sort((a, b) => (degree[b.id] || 0) - (degree[a.id] || 0))
    .slice(0, 14).forEach((n) => { n.hub = true; });
  allLinks = graph.edges.map((e) => ({ source: e.from, target: e.to, type: e.type }));

  let saved = null;
  try { saved = localStorage.getItem("dims"); } catch (e) { /* private mode */ }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) state.rotate = false;
  $("#rotate").setAttribute("aria-pressed", String(state.rotate));
  mount(saved === "2d" ? "2d" : "3d");

  window.addEventListener("resize", () => view.resize());
  trackTouches($("#graph"));
  $("#fit").addEventListener("click", () => view.fit(600));
  $("#rotate").addEventListener("click", () => setRotate(!state.rotate));
  bindZoom();
  $("#labels").addEventListener("click", () => {
    state.labels = !state.labels;
    $("#labels").setAttribute("aria-pressed", String(state.labels));
    view.restyle();
  });
  // Taking hold of the graph stops the idle spin.
  $("#graph").addEventListener("pointerdown", () => { state.touched = true; if (state.rotate) setRotate(false); });
  $("#graph").addEventListener("wheel", () => { state.touched = true; }, { passive: true });
  bindSeg("#layout", (v) => { if (v !== state.layout) setLayout(v); });
  if (["#map", "#brain"].includes(location.hash)) setLayout(location.hash.slice(1));
  bindSeg("#dims", (v) => {
    try { localStorage.setItem("dims", v); } catch (e) { /* private mode */ }
    mount(v);
  });
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

  bindSeg("#lens", (v) => { state.lens = v; renderLegend(); view.restyle(); });
  bindSeg("#f-class", (v) => { state.cls = v; applyFilters(); });
  bindSeg("#f-inv", (v) => { state.inv = v; applyFilters(); });
  $("#f-modality").addEventListener("change", (e) => { state.modality = e.target.value; applyFilters(); });
  $("#f-clinical").addEventListener("change", (e) => { state.clinical = e.target.checked; applyFilters(); });
  $("#f-connected").addEventListener("change", (e) => { state.connected = e.target.checked; applyFilters(); });
  document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
  $("#filters-toggle").addEventListener("click", (e) => {
    e.currentTarget.setAttribute("aria-expanded", e.currentTarget.getAttribute("aria-expanded") !== "true");
  });
  $("#theme").addEventListener("click", () => {
    const root = document.documentElement;
    const current = root.dataset.theme || "dark";
    root.dataset.theme = current === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (e) { /* private mode */ }
    readTheme(); renderLegend(); renderDetail(); view.restyle();
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

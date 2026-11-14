/* Guided demos: short sequences you can click through, where the page does the work for you.
 *
 * Each step describes the state the viewer should be in (layout, colouring, size, filters, a selected item, a
 * Find query ...). The runner moves the real controls to that state by clicking them, so what you see is what
 * you could do yourself. Steps are independent of each other, so Back and Next always land correctly.
 *
 * Add a demo by appending to DEMOS. A step is:
 *   { title, text, ...state, pulse? }
 * where text may contain {n:id}, replaced by how many things connect to that item, and `pulse` is a CSS
 * selector of the control to draw attention to. State keys and defaults are in DEFAULTS below.
 */
(function () {
  "use strict";

  const LONG_FIND = "I write Python and know some signal processing. I'm interested in sleep and in making consumer EEG headsets usable for real research.";

  const DEMOS = [
    {
      id: "overview", title: "The big picture", blurb: "What is in the graph, and how it connects.",
      steps: [
        { title: "A map of the neurotech world", text: "Every dot is a project, organisation, person, device, technology, condition or gap. Lines are relationships. Drag to rotate, scroll or use the zoom control to move in.", pulse: "#graph" },
        { title: "Everything connects through technologies", text: "EEG sits at the centre: {n:eeg} projects, devices and companies connect to it. Selecting an item lights up its neighbourhood and opens its details on the right.", select: "eeg" },
        { title: "Colour by what it does", text: "Switching Colour by to Class shows technologies and everything tied to them as sensing (teal) or modulating (yellow). The key in the corner follows.", lens: "class", pulse: "#lens" },
        { title: "Invasive or not", text: "Filtering to invasive technology keeps implants and the projects, people and companies around them. The distinction runs through the whole graph.", lens: "invasiveness", filter: { inv: "invasive" }, pulse: "#f-inv" },
        { title: "Clinical technology", text: "Clinical only keeps what treats a condition. Select a device to see what it is indicated for.", filter: { clinical: true }, select: "medtronic-percept", pulse: "#f-clinical" },
      ],
    },
    {
      id: "map", title: "Who is where, and how big", blurb: "Organisations on a globe, sized by staff and funding.",
      steps: [
        { title: "Flip to the map", text: "The Layout switch moves organisations onto a globe at their headquarters. Drag to spin it; most of the field is in North America and Europe.", layout: "map", pulse: "#layout" },
        { title: "Size by staff", text: "Size by Staff scales each organisation by a tier of headcount. Most are small and faint because nobody has found a figure yet: unknown is the normal state.", layout: "map", size: ["employees", "tier"], pulse: "#size-by" },
        { title: "Every number has a source", text: "Medtronic is in the top tier (over 10,000 staff). Its details give the figure, whether it is reported or an estimate, the date and a source link.", layout: "map", size: ["employees", "tier"], select: "medtronic" },
        { title: "Actual numbers, with ranges", text: "Numbers mode sizes by the real figure on a log scale. Private companies show ranges because aggregators disagree: Neuralink's funding is stored as a range of about $0.7B to $1.3B.", layout: "map", size: ["funding", "number"], select: "neuralink", pulse: "#size-scale" },
        { title: "The same sizing in the network", text: "Back in the Network layout the same sizes apply, so you can see which organisations are large and who they connect to.", size: ["funding", "tier"], pulse: "#layout" },
      ],
    },
    {
      id: "brain", title: "Devices in the brain", blurb: "Where each device typically samples or acts, in MNI space.",
      steps: [
        { title: "Switch to the brain", text: "The Brain layout places each device at the typical site in the brain, in standard MNI coordinates, inside a template brain.", layout: "brain", pulse: "#layout" },
        { title: "Deep brain stimulation", text: "The Medtronic Percept sits at the subthalamic nucleus, on both sides. Its details list the sites and their coordinates.", layout: "brain", select: "medtronic-percept" },
        { title: "A headband samples several places", text: "The Muse headband has four electrodes: two frontal, two temporal. The extra sites are drawn as markers joined to its main one.", layout: "brain", select: "muse-headband" },
        { title: "Implants reach inside", text: "Implanted devices act on specific cortex: the Utah array over the hand area of motor cortex, the Synchron Stentrode inside the vessel above it.", layout: "brain", select: "utah-array" },
        { title: "Sensing and modulating", text: "Colouring by Class separates devices that record (teal) from those that stimulate (yellow). Names on labels everything.", layout: "brain", lens: "class", labels: true, pulse: "#labels" },
      ],
    },
    {
      id: "find", title: "Find a project to work on", blurb: "Describe your interests; get matches and the reasons.",
      steps: [
        { title: "Say what you can do", text: "The Find tab takes a paragraph or a list of keywords. Here: a Python developer who is interested in sleep and consumer EEG.", view: "find", findText: LONG_FIND, pulse: "#find-text" },
        { title: "Gaps and projects, with reasons", text: "You get open gaps nobody has filled, and existing projects to join. Each card says which of your words matched and why it ranked: language, recent activity, issues welcoming newcomers.", view: "find", findText: LONG_FIND, find: true },
        { title: "Prefer a gentle start", text: "Turning on Beginner friendly and Actively maintained re-ranks towards projects with good first issues and recent commits.", view: "find", findText: LONG_FIND, beginner: true, active: true, find: true, pulse: "#find-beginner" },
        { title: "See them in the network", text: "Show matches on the network highlights the results and dims the rest, so you can see how they connect to each other.", findText: LONG_FIND, beginner: true, active: true, find: true, findGraph: true },
        { title: "Open a gap", text: "The top gap is validated sleep staging on wearable EEG: wanted by one project and building on YASA. Its details show what it would unlock.", select: "low-channel-sleep-staging-validation" },
      ],
    },
    {
      id: "gaps", title: "From a gap to a project", blurb: "How a missing piece becomes something to build.",
      steps: [
        { title: "The open gaps board", text: "Gaps are ranked by how many projects and organisations want them plus how much they unlock. A gap closes when an existing project fully covers it.", view: "gaps", pulse: "nav" },
        { title: "A project that does not exist yet", text: "The top gap is an open device descriptor registry: one machine-readable place for each headset's channels and electrode positions. BrainFlow, EEG-ExPy and MNE-Python are listed as wanting it.", select: "device-descriptor-registry" },
        { title: "What it would unlock", text: "It would unlock one-step BIDS export for consumer EEG. That gap is partly covered by MNE-BIDS, which is where a contribution would plug in.", select: "consumer-eeg-bids-export" },
        { title: "Building on what exists", text: "MNE-BIDS is the existing project to extend. Its details show who maintains it, what depends on it and which gaps it addresses.", select: "mne-bids" },
        { title: "Honest about what is not known", text: "These wants are still unverified seed data: no maintainer has confirmed them. Confirming demand with the named projects is the next step before volunteers start.", select: "device-descriptor-registry" },
      ],
    },
  ];

  const DEFAULTS = { layout: "network", lens: "type", size: ["auto", "tier"], filter: { cls: "", inv: "", modality: "", clinical: false },
    labels: false, view: "network", find: false, findGraph: false, findText: "", beginner: false, active: false, select: null };

  const $ = (s) => document.querySelector(s);
  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null)); return n; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const pick = (group, value) => { const b = $(`${group} button[data-v="${value}"]`); if (b && b.getAttribute("aria-checked") !== "true") b.click(); };
  const checked = (sel, on) => { const c = $(sel); if (c.checked !== on) c.click(); };

  let current = null, index = 0, token = 0;

  /** Move the viewer to the state a step describes, by clicking the real controls. */
  async function apply(step) {
    const s = { ...DEFAULTS, ...step, filter: { ...DEFAULTS.filter, ...(step.filter || {}) } };
    const mine = ++token;
    const body = document.body;
    // Panels first: the Find and Gaps overlays hide the network.
    if (s.view === "network") { if (!$("#find").hidden) $("#close-find").click(); if (!$("#gaps").hidden) $("#close-gaps").click(); }
    if (s.view === "find" && $("#find").hidden) $('nav button[data-view="find"]').click();
    if (s.view === "gaps" && $("#gaps").hidden) $('nav button[data-view="gaps"]').click();
    if (!s.findGraph && !$("#found-bar").hidden) $("#found-clear").click();
    if (body.dataset.layout !== s.layout && (body.dataset.layout || "network") !== s.layout) { pick("#layout", s.layout); await wait(s.layout === "network" ? 700 : 1400); }
    if (mine !== token) return;
    pick("#lens", s.lens);
    pick("#size-by", s.size[0]); pick("#size-scale", s.size[1]);
    pick("#f-class", s.filter.cls); pick("#f-inv", s.filter.inv);
    const mod = $("#f-modality"); if (mod.value !== s.filter.modality) { mod.value = s.filter.modality; mod.dispatchEvent(new Event("change")); }
    checked("#f-clinical", s.filter.clinical);
    if (($("#labels").getAttribute("aria-pressed") === "true") !== s.labels) $("#labels").click();
    if (s.findText) {
      $("#find-text").value = s.findText;
      checked("#find-beginner", s.beginner); checked("#find-active", s.active);
      if (s.find || s.findGraph) $("#find-go").click();
    }
    if (s.findGraph) { $("#find-graph").click(); await wait(900); }
    if (mine !== token) return;
    if (s.view === "network") { NTX.select(s.select); if (s.select) await wait(300); }
  }

  const fill = (text) => text.replace(/\{n:([^}]+)\}/g, (_, id) => (window.NTX && NTX.has(id) ? NTX.degree(id) : "many"));

  function pulse(selector) {
    document.querySelectorAll(".tour-pulse").forEach((n) => n.classList.remove("tour-pulse"));
    if (!selector) return;
    const target = $(selector);
    if (target) { target.classList.add("tour-pulse"); setTimeout(() => target.classList.remove("tour-pulse"), 3500); }
  }

  function render() {
    const demo = DEMOS[current], step = demo.steps[index], last = index === demo.steps.length - 1;
    const card = $("#tour-card");
    card.hidden = false;
    card.classList.toggle("bottom", (step.view || "network") !== "network");
    document.body.classList.add("touring");
    card.replaceChildren(
      el("div", { className: "tour-top" }, el("span", { className: "tour-count", textContent: `${demo.title} · ${index + 1} of ${demo.steps.length}` }),
        el("button", { className: "tour-exit", textContent: "✕", title: "End the demo (Esc)", "aria-label": "End the demo", onclick: exit })),
      el("h3", { textContent: step.title }),
      el("p", { textContent: fill(step.text) }),
      el("div", { className: "tour-nav" },
        el("button", { textContent: "Back", disabled: index === 0, onclick: () => go(index - 1) }),
        el("span", { className: "tour-dots" }, ...demo.steps.map((_, i) => el("i", { className: i === index ? "on" : "" }))),
        el("button", { className: "primary", textContent: last ? "Done" : "Next", onclick: () => (last ? exit() : go(index + 1)) })));
  }

  async function go(i) {
    index = i; render();
    await apply(DEMOS[current].steps[index]);
    pulse(DEMOS[current].steps[index].pulse);
  }

  async function start(id) {
    closeMenu();
    current = DEMOS.findIndex((d) => d.id === id);
    if (current < 0) return;
    NTX.reset();
    await wait(400);
    try { history.replaceState(null, "", `#demo-${id}`); } catch (e) { /* file:// */ }
    await go(0);
  }

  function exit() {
    current = null; token++;
    $("#tour-card").hidden = true; document.body.classList.remove("touring");
    pulse(null);
    NTX.reset();
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* file:// */ }
  }

  function closeMenu() { $("#demos-menu").hidden = true; $("#demos-btn").setAttribute("aria-expanded", "false"); }

  function mount() {
    const menu = el("div", { id: "demos-menu", className: "glass", hidden: true, role: "menu" },
      el("h3", { textContent: "Guided demos" }),
      el("p", { textContent: "Short sequences you can click through. The page does the actions; you watch, then try it yourself." }),
      ...DEMOS.map((d) => el("button", { role: "menuitem", onclick: () => start(d.id) },
        el("b", { textContent: d.title }), el("span", { textContent: `${d.blurb} (${d.steps.length} steps)` }))));
    document.body.append(menu, el("div", { id: "tour-card", className: "glass", hidden: true, role: "dialog", "aria-label": "Guided demo", "aria-live": "polite" }));
    $("#demos-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open; $("#demos-btn").setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
    document.addEventListener("keydown", (e) => {
      if (current === null || e.target.matches("input, textarea, select")) return;
      if (e.key === "ArrowRight" && index < DEMOS[current].steps.length - 1) go(index + 1);
      else if (e.key === "ArrowLeft" && index > 0) go(index - 1);
      else if (e.key === "Escape") exit();
    });
    const m = location.hash.match(/^#demo-(.+)$/);
    if (m) start(m[1]);
  }

  window.NTXDemos = { list: DEMOS, start, exit };
  if (window.NTX) mount(); else document.addEventListener("ntx-ready", mount, { once: true });
})();

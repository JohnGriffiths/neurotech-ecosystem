/* Find a project: match a paragraph or a keyword list against the graph's projects and open gaps.
 *
 * No server and no model: plain text matching, so it runs in the browser and works offline.
 *   const finder = NTXFind.index(graph);          // graph is graph.json
 *   finder.search("python, sleep EEG, consumer headsets", { prefer: ["beginner"], show: "both" });
 *
 * Each candidate is a document of weighted fields (name, tags, technologies, description, the gaps it is tied
 * to). Query words are stemmed and also expanded through a small table of concepts, so "brainwaves" finds
 * EEG and "real time" finds streaming. Text relevance is scored with inverse document frequency, then
 * adjusted by what the query says (languages it names) and by the preferences chosen (beginner friendly,
 * actively maintained). Every result carries the words that matched and the reasons it ranked.
 */
(function (root) {
  "use strict";

  const STOP = new Set(("a an and are as at be been but by for from has have i i'm im in into is it its me my of on or our so some than that the their " +
    "them then there these they this to up us was we were what when which who will with would you your about also can could do does like looking " +
    "am interested interest want wants work working help build make using use used new etc get good great really very much many lot lots way ways " +
    "thing things bit little around within across such more most other another any each both").split(" "));

  // Concept id -> phrases that mean it. A phrase in the query or a document adds the concept id as a term.
  const CONCEPTS = {
    eeg: ["eeg", "electroencephalography", "electroencephalogram", "brainwave", "brain wave", "scalp recording"],
    meg: ["meg", "magnetoencephalography", "opm"],
    fmri: ["fmri", "functional mri", "functional magnetic resonance", "bold"],
    mri: ["mri", "magnetic resonance", "structural mri", "diffusion", "dmri", "tractography", "freesurfer"],
    fnirs: ["fnirs", "nirs", "near infrared", "near-infrared", "optical imaging", "diffuse optical"],
    emg: ["emg", "electromyography", "muscle"],
    invasive: ["invasive", "implant", "ecog", "seeg", "intracortical", "spike sorting", "neuropixels", "utah array"],
    stimulation: ["stimulation", "tms", "tdcs", "tacs", "tes", "dbs", "neuromodulation", "stimulator", "neurostimulation"],
    bci: ["bci", "brain computer interface", "brain-computer interface", "brain computer", "neural interface", "decoder"],
    ml: ["machine learning", "deep learning", "neural network", "classifier", "classification", "decoding", "ai", "pytorch", "tensorflow", "model", "riemannian", "foundation model"],
    realtime: ["real time", "real-time", "realtime", "streaming", "latency", "online", "closed loop", "closed-loop", "live"],
    acquisition: ["acquisition", "driver", "sdk", "device support", "bluetooth", "ble", "serial", "hardware interface"],
    consumer: ["consumer", "wearable", "headset", "headband", "dry electrode", "low cost", "low-cost", "diy", "affordable", "muse", "openbci"],
    data: ["dataset", "open data", "benchmark", "archive", "corpus", "data curation", "harmonis", "harmoniz"],
    standards: ["bids", "nwb", "snirf", "xdf", "edf", "format", "standard", "interoperability", "interoperable", "conversion", "converter", "metadata", "schema"],
    sleep: ["sleep", "sleep staging", "polysomnography", "psg", "hypnogram", "insomnia"],
    clinical: ["clinical", "patient", "diagnosis", "therapy", "treatment", "epilepsy", "parkinson", "depression", "seizure"],
    web: ["web", "browser", "javascript", "typescript", "frontend", "website", "web app"],
    viz: ["visualisation", "visualization", "dashboard", "plot", "viewer", "interactive"],
    docs: ["documentation", "docs", "tutorial", "teaching", "education", "learning material", "writing"],
    neurofeedback: ["neurofeedback", "biofeedback", "meditation", "focus", "attention", "mindfulness"],
    signal: ["signal processing", "preprocessing", "artifact", "artefact", "filter", "denoising", "ica", "spectral", "time frequency"],
    simulation: ["simulation", "modelling", "modeling", "biophysical", "electric field", "forward model"],
  };
  const CONCEPT_LABEL = { eeg: "EEG", meg: "MEG", fmri: "fMRI", mri: "MRI", fnirs: "fNIRS", emg: "EMG", invasive: "invasive recording", stimulation: "stimulation",
    bci: "BCI", ml: "machine learning", realtime: "real-time", acquisition: "acquisition", consumer: "consumer hardware", data: "datasets", standards: "standards and formats",
    sleep: "sleep", clinical: "clinical", web: "web", viz: "visualisation", docs: "documentation and teaching", neurofeedback: "neurofeedback", signal: "signal processing", simulation: "simulation" };

  // Programming languages a person might name, as GitHub reports them.
  const LANGUAGES = { python: "Python", matlab: "MATLAB", octave: "MATLAB", javascript: "JavaScript", js: "JavaScript", typescript: "TypeScript", ts: "TypeScript",
    "c++": "C++", cpp: "C++", c: "C", "c#": "C#", csharp: "C#", rust: "Rust", julia: "Julia", java: "Java", r: "R", go: "Go", kotlin: "Kotlin", swift: "Swift", jupyter: "Jupyter Notebook" };

  const stem = (w) => {
    if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
    if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
    return w;
  };
  const words = (text) => (String(text || "").toLowerCase().replace(/[’']/g, "'").match(/[a-z0-9+#]+(?:[-'][a-z0-9+#]+)*/g) || []);
  const tokens = (text) => words(text).filter((w) => !STOP.has(w) && (w.length > 1 || w === "c" || w === "r")).map(stem);

  // Concept phrases as stemmed token sequences, so they match however the text is inflected.
  const PHRASES = Object.entries(CONCEPTS).flatMap(([id, list]) => list.map((p) => [id, words(p).map(stem)]));
  function conceptsIn(toks) {
    const found = new Set();
    for (const [id, seq] of PHRASES) {
      if (found.has(id) || !seq.length) continue;
      for (let i = 0; i + seq.length <= toks.length; i++) {
        if (seq.every((s, k) => toks[i + k] === s)) { found.add(id); break; }
      }
    }
    return found;
  }
  // Stemmed tokens before stop-word removal matter for phrases like "real time", so run phrases on all words.
  const allStems = (text) => words(text).map(stem);

  const dedupe = (list) => { const seen = new Set(); return list.filter((x) => { const k = x.toLowerCase(); return !seen.has(k) && seen.add(k); }); };
  const daysSince = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 86400000 : Infinity);
  const ago = (iso) => {
    const d = daysSince(iso);
    return d < 2 ? "today" : d < 14 ? `${Math.round(d)} days ago` : d < 60 ? `${Math.round(d / 7)} weeks ago` : d < 730 ? `${Math.round(d / 30)} months ago` : `${Math.round(d / 365)} years ago`;
  };

  function index(graph) {
    const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
    const edges = graph.edges;
    const relatedGaps = {}, maintainers = {};
    for (const e of edges) {
      if (["ADDRESSES", "REALLY_WANTS"].includes(e.type) && byId[e.to]?.type === "problem") (relatedGaps[e.from] ||= []).push(byId[e.to]);
      if (e.type === "MAINTAINS") (maintainers[e.to] ||= []).push(byId[e.from]);
    }
    const wantsOf = {};
    for (const e of edges) if (e.type === "REALLY_WANTS") (wantsOf[e.to] ||= []).push(e.from);

    // ---- documents: fields are [text, weight]
    const docs = [];
    for (const n of graph.nodes) {
      if (n.type !== "project" || n.status === "proposed" || n.github?.archived) continue;
      const gh = n.github || {};
      const gaps = relatedGaps[n.id] || [];
      docs.push({
        kind: "project", node: n, id: n.id,
        fields: [
          [n.name + " " + (n.repo || ""), 3], [(n.tags || []).join(" ") + " " + (gh.topics || []).join(" "), 2],
          [(n.facets?.modalities || []).map((m) => byId[m]?.name || m).join(" "), 2], [n.description, 1.5], [gh.language || "", 1],
          [n.layer + " " + n.kind, 1], [gaps.map((g) => g.name).join(" "), 1], [gaps.map((g) => g.description).join(" "), 0.5],
          [(maintainers[n.id] || []).map((m) => m.name).join(" "), 0.5],
        ],
      });
    }
    for (const b of graph.bounties || []) {
      const node = byId[b.id];
      docs.push({
        kind: "gap", node, bounty: b, id: b.id,
        fields: [
          [b.name, 3], [b.description, 1.5], [b.unlocks.map((u) => byId[u]?.name).join(" "), 1],
          [b.partial_solutions.map((s) => byId[s.id]?.name).join(" "), 1], [b.wanted_by.map((w) => byId[w]?.name).join(" "), 0.5],
        ],
      });
    }
    // Precompute stemmed terms (and concepts) per field, and document frequencies.
    const df = new Map();
    for (const d of docs) {
      d.terms = new Map(); // term -> {w: best field weight}
      for (const [text, w] of d.fields) {
        const toks = tokens(text);
        for (const t of [...toks, ...[...conceptsIn(allStems(text))].map((c) => "c:" + c)]) d.terms.set(t, Math.max(d.terms.get(t) || 0, w));
      }
      for (const t of d.terms.keys()) df.set(t, (df.get(t) || 0) + 1);
    }
    const idf = (t) => Math.log(1 + docs.length / (1 + (df.get(t) || 0)));

    function search(text, opts = {}) {
      const prefer = new Set(opts.prefer || []);
      const show = opts.show || "both";
      const stems = allStems(text);
      const shown = new Map(); // term -> what to display
      for (const w of words(text)) if (!STOP.has(w)) shown.set(stem(w), w);
      const query = new Map(); // term -> query weight
      for (const t of tokens(text)) query.set(t, 1);
      for (const c of conceptsIn(stems)) { query.set("c:" + c, 1.2); shown.set("c:" + c, CONCEPT_LABEL[c]); }
      // Languages named in the text. Names that are also ordinary words (c, r, go, js, ts) count only after
      // "in/with/using/know...", or as an item in a comma-separated list.
      const AMBIGUOUS = new Set(["c", "r", "go", "js", "ts"]), ws = words(text), lowered = text.toLowerCase();
      const langSet = new Set(ws.filter((w) => LANGUAGES[w] && !AMBIGUOUS.has(w)).map((w) => LANGUAGES[w]));
      for (const m of lowered.matchAll(/\b(?:in|with|using|know|knows|write|writing|coding in|programming in|skilled in)\s+(c|r|go|js|ts)\b/g)) langSet.add(LANGUAGES[m[1]]);
      for (const m of lowered.matchAll(/(?:^|[,;\n/])\s*(c|r|go|js|ts)\s*(?=$|[,;\n/])/g)) langSet.add(LANGUAGES[m[1]]);   // an item in a list
      const langs = [...langSet];
      if (!query.size && !langs.length) return { projects: [], gaps: [], terms: [], languages: [] };

      const results = [];
      for (const d of docs) {
        if (show === "projects" && d.kind !== "project") continue;
        if (show === "gaps" && d.kind !== "gap") continue;
        let text_score = 0;
        const hit = [];
        for (const [t, qw] of query) {
          const w = d.terms.get(t);
          if (!w) continue;
          text_score += idf(t) * qw * w;
          hit.push([idf(t) * qw * w, shown.get(t) || t]);
        }
        const gh = d.node.github || {};
        let score = text_score, why = [];
        if (d.kind === "project") {
          if (langs.length) {
            if (langs.includes(gh.language)) { score += 1.5 + text_score * 0.2; why.push(`written in ${gh.language}`); }
            else if (text_score) score *= 0.8;
          }
          const age = daysSince(gh.pushed);
          if (age <= 90) { score *= prefer.has("active") ? 1.35 : 1.1; why.push(`active (last push ${ago(gh.pushed)})`); }
          else if (age > 730) { score *= prefer.has("active") ? 0.4 : 0.7; why.push(`quiet (last push ${ago(gh.pushed)})`); }
          if (gh.good_first_issues) { score *= prefer.has("beginner") ? 1.5 : 1.12; why.push(`${gh.good_first_issues} good first issue${gh.good_first_issues > 1 ? "s" : ""}`); }
          if (gh.help_wanted) { score *= 1.08; why.push(`${gh.help_wanted} help-wanted issue${gh.help_wanted > 1 ? "s" : ""}`); }
          if ((d.node.tags || []).includes("flagship")) { score *= 1.1; why.push("a NeuroTechX flagship project"); }
          if (prefer.has("beginner") && gh.stars > 3000) score *= 0.85;      // very large codebases are harder to enter
        } else {
          const wanted = d.bounty.wanted_by.length;
          if (wanted) { score *= 1 + Math.min(0.5, wanted * 0.08); why.push(`wanted by ${wanted} project${wanted > 1 ? "s" : ""} or organisation${wanted > 1 ? "s" : ""}`); }
          if (d.bounty.unlocks.length) why.push(`unlocks ${d.bounty.unlocks.length} thing${d.bounty.unlocks.length > 1 ? "s" : ""}`);
          if (d.bounty.partial_solutions.length) why.push(`builds on ${d.bounty.partial_solutions.map((s) => byId[s.id]?.name).join(", ")}`);
          if (prefer.has("new")) score *= 1.25;
        }
        if (!text_score && !(langs.includes(gh.language) && d.kind === "project" && !query.size)) continue;
        hit.sort((a, b) => b[0] - a[0]);
        results.push({ id: d.id, kind: d.kind, node: d.node, bounty: d.bounty, github: gh, score, matched: dedupe(hit.map((h) => h[1])).slice(0, 6), why });
      }
      results.sort((a, b) => b.score - a.score);
      return {
        projects: results.filter((r) => r.kind === "project").slice(0, 12),
        gaps: results.filter((r) => r.kind === "gap").slice(0, 6),
        terms: dedupe([...query.keys()].map((t) => shown.get(t) || t)),
        languages: langs,
      };
    }
    return { search, ago };
  }

  /** A prompt a person can paste into any assistant, with their text and the shortlist. */
  function prompt(text, result) {
    const line = (r) => {
      const gh = r.github || {};
      const bits = r.kind === "project"
        ? [r.node.repo && `github.com/${r.node.repo}`, gh.language, gh.pushed && `last push ${gh.pushed}`, gh.good_first_issues && `${gh.good_first_issues} good first issues`].filter(Boolean)
        : [`gap`, r.bounty.wanted_by.length && `wanted by ${r.bounty.wanted_by.length}`].filter(Boolean);
      return `- ${r.node.name} (${bits.join("; ")}): ${r.node.description}`;
    };
    return [
      "I want to contribute to open-source neurotechnology. Here is what I said about my interests and skills:", "", `"${text.trim()}"`, "",
      "From the NeuroTech Ecosystem graph, these are the closest matches (existing projects first, then open gaps nobody has filled):", "",
      "Existing projects:", ...result.projects.slice(0, 8).map(line), "", "Open gaps:", ...result.gaps.slice(0, 5).map(line), "",
      "Please recommend the three best fits for me and say why. For each, suggest a first small contribution I could make this month, and what I would need to learn. Be honest where a match is weak.",
    ].join("\n");
  }

  const api = { index, prompt, tokens, conceptsIn, stem };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NTXFind = api;
})(typeof window !== "undefined" ? window : globalThis);

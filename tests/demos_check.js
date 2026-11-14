// Run by tests/test_demos.py: checks every guided-demo step against the exported graph.
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const graph = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const ids = new Set(graph.nodes.map((n) => n.id));
const sandbox = { window: {}, document: { addEventListener() {}, querySelector() { return null; } }, location: { hash: "" }, console };
vm.runInNewContext(fs.readFileSync(`${__dirname}/../web/demos.js`, "utf8"), sandbox);
const demos = sandbox.window.NTXDemos.list;
const KEYS = new Set(["title", "text", "pulse", "select", "layout", "lens", "size", "filter", "labels", "view", "find", "findGraph", "findText", "beginner", "active"]);
const LAYOUTS = ["network", "map", "brain"], LENSES = ["type", "class", "invasiveness"], BYS = ["auto", "employees", "funding", "revenue"];
assert.ok(demos.length >= 3, "there are demos");
for (const d of demos) {
  assert.ok(d.id && d.title && d.blurb && d.steps.length >= 3, `demo ${d.id} is complete`);
  d.steps.forEach((s, i) => {
    const where = `${d.id} step ${i + 1}`;
    assert.ok(s.title && s.text, `${where} has a title and text`);
    for (const k of Object.keys(s)) assert.ok(KEYS.has(k), `${where}: unknown key ${k}`);
    if (s.select) assert.ok(ids.has(s.select), `${where}: ${s.select} is not in the graph`);
    if (s.layout) assert.ok(LAYOUTS.includes(s.layout), `${where}: bad layout`);
    if (s.lens) assert.ok(LENSES.includes(s.lens), `${where}: bad lens`);
    if (s.size) assert.ok(BYS.includes(s.size[0]) && ["tier", "number"].includes(s.size[1]), `${where}: bad size`);
    for (const m of s.text.matchAll(/\{n:([^}]+)\}/g)) assert.ok(ids.has(m[1]), `${where}: {n:${m[1]}} is not in the graph`);
    // A selected item must belong to the step's layout, or selecting it would switch layout and surprise the viewer.
    const node = graph.nodes.find((n) => n.id === s.select);
    if (node && s.layout === "map") assert.ok(node.geo, `${where}: ${s.select} has no map position`);
    if (node && s.layout === "brain") assert.ok(node.brain, `${where}: ${s.select} has no brain site`);
  });
}
console.log(`ok: ${demos.length} demos, ${demos.reduce((n, d) => n + d.steps.length, 0)} steps`);

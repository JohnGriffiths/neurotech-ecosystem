// Run by tests/test_find.py with the exported graph: node tests/find_check.js graph.json
const assert = require("assert");
const find = require("../web/find.js");
const f = find.index(JSON.parse(require("fs").readFileSync(process.argv[2], "utf8")));
const names = (rows) => rows.map((r) => r.node.name);

let r = f.search("I am a Python developer interested in sleep staging with consumer EEG headbands");
assert.ok(names(r.projects).slice(0, 3).includes("YASA"), "sleep + Python should surface YASA");
assert.strictEqual(r.gaps[0].node.name, "Validated sleep staging on low-channel wearable EEG");
assert.deepStrictEqual(r.languages, ["Python"]);
assert.ok(r.projects[0].why.length && r.projects[0].matched.length, "every result explains itself");

r = f.search("MATLAB, fMRI, preprocessing");
assert.ok(names(r.projects).slice(0, 3).includes("SPM"), "MATLAB + fMRI should surface SPM");

r = f.search("javascript, web bluetooth, browser");
assert.ok(names(r.projects).slice(0, 3).includes("muse-js"));
assert.strictEqual(r.gaps[0].node.name, "Browser-native acquisition and streaming stack");

assert.deepStrictEqual(f.search("qwertyuiop zzzz").projects, [], "nonsense matches nothing");
assert.deepStrictEqual(f.search("   ").gaps, [], "empty input matches nothing");
assert.ok(f.search("eeg", { show: "gaps" }).projects.length === 0, "show=gaps returns no projects");
assert.ok(f.search("eeg", { show: "projects" }).gaps.length === 0, "show=projects returns no gaps");

// Preferences change the ranking.
const plain = f.search("brain-computer interface software", {}).projects.map((p) => p.node.name);
const begin = f.search("brain-computer interface software", { prefer: ["beginner"] }).projects;
assert.ok(begin.slice(0, 5).some((p) => p.github.good_first_issues > 0), "beginner preference favours good-first-issue projects");
assert.ok(plain.length > 0);

// Ambiguous language names count only in context.
assert.deepStrictEqual(f.search("a study of the R wave in sleep").languages, []);
assert.deepStrictEqual(f.search("I code in R and want to work on sleep EEG").languages, ["R"]);

const prompt = find.prompt("python and sleep", f.search("python and sleep"));
assert.ok(prompt.includes("Existing projects:") && prompt.includes("Open gaps:") && prompt.includes("python and sleep"));
console.log("ok");

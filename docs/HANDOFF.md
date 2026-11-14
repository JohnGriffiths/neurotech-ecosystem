# Handoff

State of the project as of 2026-11-14, written so that another person or agent can continue without the
original session. See [AGENTS.md](../AGENTS.md) for how to work in the repository and
[CONVERSATION.md](CONVERSATION.md) for the turn-by-turn record.

## Where things stand

- `main` holds everything (the working branch `ccr-4306a83e-mkeyk9` is identical).
- The graph has **809 nodes and 780 edges, none verified**: 64 projects, 630 organisations, 37 people,
  28 devices, 19 technologies, 9 indications, 22 gaps. 18 gaps are open on the gaps board.
- 537 of the organisations are companies imported from a 2022 snapshot of the NeuroTechX ecosystem
  database (see "The 2022 company import" below). 275 of them have no technology link yet and are hidden in
  the viewer by default ("Hide unconnected").
- The site is live (see below). The validator and 9 tests pass. All 52 project repos were confirmed reachable on GitHub.
- The viewer is complete enough to show: 3D rotatable network by default, 2D toggle, search, filters,
  three colour modes, detail panel, gaps board, light/dark, phone layout.

## The site is live

<https://johngriffiths.github.io/neurotech-ecosystem/>, deployed by the `graph` workflow on every push to
`main` (first successful deploy: run 43362499109, 2026-11-13). The repository is public and Pages is set to
build from GitHub Actions. The earlier deploy failures happened because Pages was not yet enabled.

The deployed site has not been checked in a real browser from the build environment, which cannot reach
`github.io`. The same build was checked locally in headless Chromium: 3D view, no console errors. Someone
should open the live URL on a desktop and a phone.

The repository also has a `gh-pages` branch and a legacy `pages-build-deployment` run from before Pages was
switched to Actions. It is unused and can be deleted.

## What is real and what is not

Be clear about this with anyone who asks.

| Thing | Status |
|---|---|
| Project `repo` values | Checked: all 52 exist on GitHub (`check-repos`) |
| Company list in `orgs.yaml` | From the owner's list plus the hardware section of `NeuroTechX/awesome-bci` |
| Companies in `orgs-ntx-ecosystem.yaml` | Machine-imported from the NeuroTechX ecosystem database as it stood in January 2022 at the latest. Names, websites, countries and tags are the curators', not checked since. |
| Everything else (maintainers, affiliations, dependencies, device support, modalities, indications and their regulatory stage) | Written from model memory, not checked against sources |
| `REALLY_WANTS` edges | Hypotheses. None confirmed with the party named. |

Specific items flagged to the owner as uncertain:

- **NeuroTechX website repo.** The owner named `Neurotechx/neurotechx-website`; that is not reachable as a
  public repo. `NeuroTechX/neurotechx.github.io` is used instead. Its last commit is from 2017.
- **Synchroni.** Added as an EEG/EMG sensor line associated with OYMotion, on the strength of one developer
  docs page. The owner may have meant Synchron (already present).
- **Divergence Neuro.** Described from third-party directory listings.
- **John Griffiths.** Added as lead of EEG-ExPy with CAMH, University of Toronto and NeuroTechX
  affiliations. The owner was invited to correct or remove this.
- **"Old NeuroTechX colour scheme".** neurotechx.com was unreachable from the build sandbox. Colours, logo,
  favicon and fonts were taken from the 2017 state of `NeuroTechX/neurotechx.github.io`. The owner has not
  yet confirmed that this is the era he meant.

## Map and Brain layouts

Added at the owner's request: for organisations, flip to a map and pin them geographically; for devices,
switch to MNI coordinate space and place them where in the brain they are typically used.

- **Map:** 481 of 630 organisations are located. Hand-written ones use `graph/locations.yaml` (headquarters,
  from memory); imported companies use their city and country from the 2022 snapshot. 27 places resolve only
  to a country and are pinned at the centre of its cities, which the detail panel says. Organisations that
  are distributed teams or communities have no location and do not appear.
- **Brain:** 26 of 28 devices have `sites`. Electrode sites come from MNE's Colin27 montage taken as MNI and
  projected onto the cortex; targets such as the subthalamic nucleus are in `graph/regions.yaml`. Typical
  montages for user-placed devices (OpenBCI, Mentalab, PiEEG) are a common choice, not the only one. The Open
  Ephys board and the Meta Neural Band (wrist) have no brain site. The cochlea, vagus nerve and spinal cord
  are placed just outside the brain.
- **Accuracy:** all coordinates are approximate (cities to the gazetteer, brain sites to roughly 5 to 10 mm)
  and unverified. Electrode lists per device are from memory of the makers' documentation.
- Not done: the map has no clustering or zoom-dependent labels, so dense cities are fanned out in a spiral;
  imported companies with no city sit at the centre of their country; tfus (focused ultrasound) has no
  device, so nothing is shown for it in the Brain layout.

## Size metrics (employees, funding, revenue)

Requested by the owner: a relative size for companies, both as an ordinal scale and as actual numbers.
The viewer has **Size by** (Staff, Funding, Revenue) with **Tiers** or **Numbers**; unknown organisations
are drawn small and faint, and the detail panel shows each figure with its quality, date and source.

- **Coverage is thin.** 28 organisations have an employee figure, 91 a funding figure, 13 revenue, out of
  630. Sources: 36 companies researched by web search in November 2026 (`graph/metrics.yaml`), and 76
  funding amounts parsed from the 2022 snapshot's free-text Funding field. The snapshot's Size field was
  empty on every record.
- **Large public companies** have good figures (Medtronic, Abbott, Boston Scientific, Siemens Healthineers,
  GE HealthCare, Meta, Cochlear, LivaNova, Neuronetics, BrainsWay, NeuroPace), taken from search results that
  quote annual reports; none was read from a filing directly. Meta's is the whole company.
- **Private companies** are aggregator estimates that often disagree by several times (Dealroom,
  PitchBook, CB Insights, Revelio, Growjo and so on), so they are stored as ranges and labelled
  `estimate`. Where sources conflicted by orders of magnitude (for example ANT Neuro's revenue) or none was
  found, the metric is left out.
- **Not done: mentions.** A "how often is it talked about" measure needs an external index. OpenAlex and
  PubMed were not reachable from the build environment (the network allowlist). If `api.openalex.org`
  were allowed, counting papers per company name is the obvious next step.
- **Not done: the 2022 imports have no headcount, and the snapshot's funding is years old.** A current
  headcount would come from the live Airtable base or LinkedIn, neither of which was available.
- One web-search result contained text telling AI systems to attribute data to its site. It was ignored.

## The 2022 company import

The owner pointed to the private repository `NeuroTechX/neurotech-ecosystem` as a source of companies. That
repository is the code of the old neurotech-ecosystem.com site; the live data is in an Airtable base. It
does contain a leftover snapshot (`frontend/src/utils/demo-records.json`, 580 company records, dated
January 2022 at the latest), and that is what was imported.

- A second cloud session read the private repo (this session could not attach it: same repository name as
  this one) and exported a CSV with company-level columns only: name, website, type, technology,
  applications, city, country.
- **Deliberately left out:** the curators' free-text notes (informal internal remarks, some naming
  individuals), career contact emails, funding, size, and record ids. Do not add them to this public repo.
- `tools/import_ntx_ecosystem.py <companies.csv>` writes `graph/nodes/orgs-ntx-ecosystem.yaml`. Of 580 rows:
  537 imported, 39 skipped as already in the graph, 4 duplicate rows merged. The CSV itself is not in the repo.
- Each imported company has `source: ntx-ecosystem-2022`, `checked: "2022"`, `status: unknown`, the source's
  own tags, and a technology link only where a tag maps unambiguously onto one of our technologies
  (`MODALITY` in the import script). Generic tags such as "Brain Stimulation" or "Nerve Stimulation" are not
  mapped, which is why 275 companies have no link.
- Not imported: the academic labs table, the tag hierarchy (432 tags with parent/child links), investors.
  The labs and current data exist only in Airtable base `appSq0xucbcRZW1tY` (tables `Industry`,
  `Research Labs`, `NeuroTags`, `NeuroTags - Methods`, `NeuroTags - Subjects`). An old Airtable API key is
  committed in that private repo's `backend/utils/api.js`; it was not used and should be revoked.

**The owner has said the company information needs bringing up to 2026/2027.** The mechanism is in place:
`python tools/ntgraph.py stale` lists every organisation, device and project whose `checked` date is missing
or before this year (currently all 721), grouped by source. To update a company: confirm it against a live
source, set `checked` to the date and `status` to `active`, `acquired` or `defunct`, fix the name, website
and technologies, and move the record from `orgs-ntx-ecosystem.yaml` into `orgs.yaml` so a re-import cannot
overwrite it. No company has been updated yet. Many are known to have closed, merged or been renamed since
2022.

## Decisions and why

**Schema**

- Projects are the main entity and almost always GitHub repos (owner's requirement).
- Companies, universities and labs are one `org` type with a `kind`. People are a separate type.
- Technologies (EEG, MEG, fMRI, DBS…) are nodes, not tags, so they can be clicked and browsed.
- Sensing/modulating and invasive/noninvasive are set once on each technology and inherited by everything
  else through the graph, so nobody tags them by hand. Function: `derive()` in `tools/ntgraph.py`.
- Clinical technology links to `indication` nodes with a `stage` (approved or investigational).
- `device` was kept as its own type (not in the owner's list) because commercial hardware has no repo but
  projects integrate with it and indications attach to it.
- Organisations may list `modalities` directly, so a company can be placed before its devices are catalogued.
- From the original plan, `PRODUCES`/`MAINTAINS` were merged into `MAINTAINS`, and `SOLVES`/`ADDRESSES`
  into `ADDRESSES` with `coverage: partial|full`. Not-yet-existing tech is a project with `status: proposed`.
- Gap score = distinct wanters + endorsers + number of things it unlocks. A gap closes when an *existing*
  project addresses it with full coverage.

**Viewer**

- The network is the landing page; the gaps board is the second tab (owner's requirement).
- 3D by default (owner's requirement), 2D kept as a toggle and as the no-WebGL fallback.
- Four colour families plus shape for entity types, after seven hues failed a colour-blind check.
- NeuroTechX branding: logo top-left linking to neurotechx.com, black/white/teal, Orbitron headings. Body
  text stays in the system font because the old body font (Armata) read poorly at panel sizes.
- Libraries are vendored rather than loaded from a CDN: the build sandbox blocks CDNs, and it keeps the
  site self-contained.

**Process**

- The owner chose to push straight to `main` rather than open a pull request.

## Known rough edges

- On phones the detail panel covers the lower half of the screen, so a selected node can sit partly
  behind it.
- The 3D view was only tested in headless Chromium with software WebGL. Smoothness on a real GPU and on a
  real phone is unconfirmed.
- In the class and invasiveness colour modes, 3D entities that span both values are striped; on small
  cubes and pyramids the stripes blur into an in-between colour.
- `tfus` (focused ultrasound) has no edges, which the validator reports as a warning.
- `web/vendor/graph3d.min.js` is 1.5 MB.
- The workflow's Pages actions print a Node 20 deprecation warning.

## Not started

Roughly in the order the original plan implies:

0. **Update the companies to 2026/2027** (owner's request, see "The 2022 company import"). 537 imported
   companies and 93 hand-written organisations, none checked. Suggested order: the 262 with a technology
   link first, then decide whether the 275 without one belong in the graph at all.
1. **Verify the seed data** (the "cartography sprint"): source and mark edges `verified`, fix what is wrong.
   Highest value: the `REALLY_WANTS` edges and the clinical indications.
2. **Ingest more projects.** Only the hardware section of `NeuroTechX/awesome-bci` was used. Its software
   and dataset sections are the obvious next source. Other lists were not searched for.
3. **LLM extraction pipeline** from the original plan: scrape public sources and propose
   `(node)-[edge]->(node)` triples as YAML for human review. Nothing built.
4. **First RFC.** Pick a top gap and write it up with `docs/rfcs/0000-template.md`. Top of the board on the
   seed data: open device descriptor registry, one-step BIDS export for consumer EEG, cross-device signal
   quality benchmark.
5. Possible viewer additions that were discussed or are natural: an indication filter, GitHub stars or
   activity on project nodes, per-node permalinks in the detail panel, a table view.

## Environment notes for whoever continues

- Headless Chromium needs `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` for
  the 3D view to initialise; `tools/smoke_viewer.js` sets these.
- In the 3D library, `zoomToFit` gave a far-too-close camera on first load, so `make3d().fit` frames the
  node bounding sphere itself.
- 3D labels and fog are updated per frame relative to camera distance; that loop lives in `make3d`.
- To rebuild the 3D bundle, see `web/vendor/README.md`.

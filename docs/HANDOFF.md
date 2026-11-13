# Handoff

State of the project as of 2026-11-13, written so that another person or agent can continue without the
original session. See [AGENTS.md](../AGENTS.md) for how to work in the repository and
[CONVERSATION.md](CONVERSATION.md) for the turn-by-turn record.

## Where things stand

- `main` holds everything (the working branch `ccr-4306a83e-mkeyk9` is identical).
- The graph has **272 nodes and 466 edges, none verified**: 64 projects, 93 organisations, 37 people,
  28 devices, 19 technologies, 9 indications, 22 gaps. 18 gaps are open on the gaps board.
- The validator and 9 tests pass. All 52 project repos were confirmed reachable on GitHub.
- The viewer is complete enough to show: 3D rotatable network by default, 2D toggle, search, filters,
  three colour modes, detail panel, gaps board, light/dark, phone layout.

## Blocked: the site is not live

The GitHub Actions workflow builds the site and uploads it, but the publish step fails with
`Failed to create deployment (status: 404) ... Ensure GitHub Pages has been enabled`. It has failed twice
(run 43358030253, attempts 1 and 2).

To unblock, the repository owner must:

1. Make the repository public (he said he would).
2. Settings → Pages → Source: **GitHub Actions**.

Then re-run the `graph` workflow (Actions tab, or its `workflow_dispatch` trigger). The site should appear
at `https://johngriffiths.github.io/neurotech-ecosystem/`. After the first successful deploy, check that the
3D view loads there and add the URL to the README.

## What is real and what is not

Be clear about this with anyone who asks.

| Thing | Status |
|---|---|
| Project `repo` values | Checked: all 52 exist on GitHub (`check-repos`) |
| Company list in `orgs.yaml` | From the owner's list plus the hardware section of `NeuroTechX/awesome-bci` |
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

# Graph schema

Seven node types, nine edge types. The machine-checked version is `NODE_KINDS` and `EDGE_RULES` in
[`tools/ntgraph.py`](../tools/ntgraph.py); change both together.

## Nodes

Files in `graph/nodes/*.yaml`. Each file has an optional `defaults` mapping applied to every entry.
Every node has `id` (unique, `lowercase-kebab-case`, never renamed once merged), `type`, `name` and
`description`. `url` and `tags` are optional everywhere, as are two provenance fields: `source` (where the
record came from, e.g. `ntx-ecosystem-2022`) and `checked` (when someone last confirmed it against a live
source, as `YYYY`, `YYYY-MM` or `YYYY-MM-DD`). `python tools/ntgraph.py stale` lists organisations, devices
and projects whose `checked` date is missing or older than this year.

| Type | What it is | Extra fields |
|---|---|---|
| `project` | **The main entity.** Almost always a GitHub repository. | `repo: owner/name`; `kind`: `software`, `hardware`, `dataset`, `standard`, `resource`; `layer`; `status`: `exists` (default) or `proposed`; `modalities` |
| `device` | A hardware product. | `modalities`; `sites`: where in the brain it typically samples or acts |
| `org` | A company, university, lab or other group. | `kind`: `company`, `university`, `institute`, `lab`, `oss_team`, `community`, `standards_body`, `regulator`; `modalities`; `city`; `country`; `status`: `active`, `acquired`, `defunct`, `unknown` |
| `person` | Someone with a public role on a project or organisation. | `github` (optional handle) |
| `modality` | A technology: EEG, MEG, fMRI, DBS, TMS… | `class`: `sensing`, `modulating` or `[sensing, modulating]`; `invasiveness`: `invasive` or `noninvasive` |
| `indication` | A condition that clinical neurotechnology diagnoses or treats. | |
| `problem` | Something missing. | `kind`: `bottleneck` or `capability` (what the bottleneck holds back) |

Notes:

- A project that exists must have a `repo`, or a `url` if it is not on GitHub.
- `layer` is one of `acquisition`, `streaming`, `processing`, `modelling`, `ml`, `experiment`, `data`,
  `standard`, `hardware`, `community`.
- `modalities: [eeg, meg]` on a project, device or org is shorthand: each entry becomes a `USES` edge.
  Put it on an org when you know what the organisation works with but have not yet added its devices.
- `tags` are free-form. `flagship` marks the NeuroTechX flagship projects.
- `python tools/ntgraph.py check-repos` confirms that every `repo` is reachable on GitHub.
- A `proposed` project is one that should exist but does not. It appears on the gaps board.

## Size metrics

Organisations can carry `metrics`: `employees`, `funding` (total raised) and `revenue`. Most have none, and
"unknown" is the normal state. Each metric is a `value`, or a `low` and `high` range where sources
disagree, plus `quality` (`reported`: the company's own figure as a secondary source quotes it; `estimate`:
an aggregator's estimate), `as_of` (when it applies), `source` (a URL) and an optional `note`. Money may
have a `currency`.

Metrics live in `graph/metrics.yaml` (researched, keyed by organisation id) and, for the 2022 import, inline
on the generated nodes. An entry in `metrics.yaml` overrides the import metric by metric.

The build derives an ordinal **tier** from 1 (smallest) to 6, so the viewer can size by tier or by the
actual figure. A range is placed by its geometric midpoint. Non-dollar amounts are converted at fixed
approximate rates (`FX_TO_USD`) for tiering and sizing only.

| Tier | Employees | Funding raised | Revenue |
|---|---|---|---|
| 1 | 1–10 | under $1M | under $1M |
| 2 | 11–50 | $1–10M | $1–10M |
| 3 | 51–200 | $10–50M | $10–100M |
| 4 | 201–1,000 | $50–250M | $100M–1B |
| 5 | 1,001–10,000 | $250M–1B | $1–10B |
| 6 | over 10,000 | over $1B | over $10B |

A fourth idea, mentions (how often an organisation is talked about), is not implemented: it needs an
external source such as a literature or news index.

## Places and brain sites

Two layouts in the viewer place nodes in space. Both rest on reference data that is generated, not
hand-edited.

**Map (organisations).** An organisation's `city` and `country` are resolved to coordinates through
`graph/places.json`. Hand-written organisations get theirs from `graph/locations.yaml` (`id: "City, Country"`),
so their node files stay untouched; imported companies carry their own. A place not found as a city falls
back to the centre of its country, and the exported node says which (`geo.precision`). Regenerate the
places after adding locations: `python tools/geocode_places.py` (needs `pip install geonamescache`).
Small towns the gazetteer lacks are listed in that script's `MANUAL` table.

**Brain (devices).** A device's `sites` is a list of 10-05 electrode names (`graph/electrodes.json`, with an
MNI position for each) or ids from `graph/regions.yaml` (named targets such as `stn-left`, with MNI
coordinates in mm). The first site is the primary one and is where the node is pinned; the others are drawn
as markers joined to it. An electrode's position is the point on the cortex beneath it. The template brain
is `web/brain.json`. All of this is approximate, about 5 to 10 mm, and written from memory, so it is
unverified like the rest. Regenerate electrodes and the brain with `python tools/make_brain_data.py` (needs
`pip install nilearn mne scikit-image scipy`); the coastlines with `node tools/make_world_data.js`.

## Edges

Files in `graph/edges/*.yaml`, same `defaults` mechanism. An edge is `{from, type, to}` plus optional fields.

| Type | From → To | Meaning |
|---|---|---|
| `MAINTAINS` | org, person → project, device | Produces or stewards it |
| `AFFILIATED_WITH` | person, org → org | Member of; or a lab within a university |
| `DEPENDS_ON` | project → project | Cannot function without it |
| `INTEGRATES_WITH` | project → project, device | Reads from, writes to or drives it |
| `USES` | project, device, org → modality | Works with this technology |
| `INDICATED_FOR` | device, modality, project → indication | Diagnoses or treats it. Requires `stage: approved` or `investigational`. |
| `ADDRESSES` | project → problem | Covers the problem. Requires `coverage: partial` or `full`. |
| `REALLY_WANTS` | org, person, project → problem, proposed project | Would benefit materially if this were solved or existed |
| `BLOCKS` | problem → problem | Usually bottleneck → capability |

Optional edge fields:

| Field | Notes |
|---|---|
| `status` | `unverified` (default) or `verified` |
| `evidence` | List of public URLs. Required when `verified`. |
| `verified_by` | GitHub handle of the Cartographer who checked it. Required when `verified`. |
| `note` | One line of context |
| `endorsed_by` | `REALLY_WANTS` only. GitHub handles of people who second the want. |

`stage: approved` means regulatory approval or clearance in at least one major market; `investigational`
means in clinical trials.

## Derived facets

The build computes, for every node, the facets the viewer filters and colours by:

- **class** (sensing / modulating) and **invasiveness**: a modality has them directly. Projects and devices
  inherit them from the modalities they use, orgs and people from what they maintain and where they are
  affiliated, indications from what is indicated for them, and gaps from the projects that address or want them.
- **clinical**: anything with an `INDICATED_FOR` edge, and whoever maintains it.

Do not set these by hand. Add the `USES`, `MAINTAINS` or `INDICATED_FOR` edge and they follow.

## Verification

An edge is a claim about the world. A `REALLY_WANTS` edge is a claim about what someone else needs, and an
`INDICATED_FOR` edge is a medical claim. Seed and LLM-proposed edges enter as `unverified`. To mark one
`verified`:

- `MAINTAINS`, `AFFILIATED_WITH`, `DEPENDS_ON`, `INTEGRATES_WITH`, `USES`: link the repository, dependency
  manifest, documentation or the person's own public profile.
- `INDICATED_FOR`: link the regulator's record or the trial registration.
- `ADDRESSES`: link documentation or an example showing what is and is not covered.
- `REALLY_WANTS`: link a public statement of the need from the party named (issue, roadmap, forum post,
  paper), or an issue in this repository opened by them using the "I really want this" template.

## Gap score

The gaps board lists every `bottleneck` and every `proposed` project, unless an existing project
`ADDRESSES` the bottleneck with `coverage: full`.

```
score = distinct REALLY_WANTS sources + distinct endorsers + number of things it unlocks
```

"Unlocks" is what the gap `BLOCKS`. For a proposed project it is the problems it would fully address plus
what those block.

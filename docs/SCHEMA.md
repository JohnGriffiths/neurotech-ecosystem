# Graph schema

Seven node types, nine edge types. The machine-checked version is `NODE_KINDS` and `EDGE_RULES` in
[`tools/ntgraph.py`](../tools/ntgraph.py); change both together.

## Nodes

Files in `graph/nodes/*.yaml`. Each file has an optional `defaults` mapping applied to every entry.
Every node has `id` (unique, `lowercase-kebab-case`, never renamed once merged), `type`, `name` and
`description`. `url` and `tags` are optional everywhere.

| Type | What it is | Extra fields |
|---|---|---|
| `project` | **The main entity.** Almost always a GitHub repository. | `repo: owner/name`; `kind`: `software`, `hardware`, `dataset`, `standard`, `resource`; `layer`; `status`: `exists` (default) or `proposed`; `modalities` |
| `device` | A hardware product. | `modalities` |
| `org` | A company, university, lab or other group. | `kind`: `company`, `university`, `institute`, `lab`, `oss_team`, `community`, `standards_body`, `regulator`; `modalities` |
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

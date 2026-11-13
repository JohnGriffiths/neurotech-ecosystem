# Graph schema

Three node types, six edge types. The machine-checked version is `NODE_KINDS` and `EDGE_RULES` in
[`tools/ntgraph.py`](../tools/ntgraph.py); change both together.

## Nodes

Files in `graph/nodes/*.yaml`. Each file has an optional `defaults` mapping applied to every entry.

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique, `lowercase-kebab-case`. Never rename once merged. |
| `type` | yes | `actor`, `tech` or `problem` |
| `kind` | yes | See below |
| `name` | yes | Display name |
| `description` | yes | One or two sentences. For problems, say what is missing and why it hurts. |
| `url` | no | Canonical home page or repository |
| `layer` | tech only | `hardware`, `acquisition`, `streaming`, `processing`, `ml`, `experiment`, `data`, `standard` |
| `status` | tech only | `exists` (default) or `proposed` for tech that should exist but does not |
| `tags` | no | Free-form list |

| Type | Kinds |
|---|---|
| `actor` | `company`, `lab`, `maintainer`, `community`, `standards_body`, `regulator` |
| `tech` | `hardware`, `software`, `dataset`, `standard` |
| `problem` | `bottleneck` (something missing or broken), `capability` (something people want to be able to do) |

## Edges

Files in `graph/edges/*.yaml`, same `defaults` mechanism. An edge is `{from, type, to}` plus optional fields.

| Type | From → To | Meaning |
|---|---|---|
| `MAINTAINS` | actor → tech | Produces or stewards it |
| `DEPENDS_ON` | tech → tech | Cannot function without it |
| `INTEGRATES_WITH` | tech → tech | Reads from, writes to or drives it |
| `ADDRESSES` | tech → problem | Covers the problem. Requires `coverage: partial` or `full`. |
| `REALLY_WANTS` | actor or tech → problem or proposed tech | Would benefit materially if this were solved or existed |
| `BLOCKS` | problem → problem | Usually bottleneck → capability |

Optional edge fields:

| Field | Notes |
|---|---|
| `status` | `unverified` (default) or `verified` |
| `evidence` | List of public URLs. Required when `verified`. |
| `verified_by` | GitHub handle of the Cartographer who checked it. Required when `verified`. |
| `note` | One line of context, e.g. why coverage is only partial |
| `endorsed_by` | `REALLY_WANTS` only. GitHub handles of people who second the want. |

## Verification

An edge is a claim about the world, and a `REALLY_WANTS` edge is a claim about what someone else needs. Seed
and LLM-proposed edges enter as `unverified`. To mark one `verified`:

- `MAINTAINS`, `DEPENDS_ON`, `INTEGRATES_WITH`: link the repository, dependency manifest or documentation.
- `ADDRESSES`: link documentation or an example showing what is and is not covered.
- `REALLY_WANTS`: link a public statement of the need from the actor (issue, roadmap, forum post, paper), or
  an issue in this repository opened by them using the "I really want this" template.

## Bounty score

The bounty board lists every `bottleneck` and every `proposed` tech, unless an existing tech `ADDRESSES` the
bottleneck with `coverage: full`.

```
score = distinct REALLY_WANTS sources + distinct endorsers + number of things it unlocks
```

"Unlocks" is what the gap `BLOCKS`. For proposed tech it is the problems it would fully address plus what
those block.

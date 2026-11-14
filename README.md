# neurotech-ecosystem

A knowledge graph of the neurotechnology ecosystem, kept as YAML in Git and explored through an interactive
network view. Its purpose is to generate well-scoped open-source projects.

**Projects** are the main entities, almost always GitHub repositories. Around them sit the **organisations**
(companies, universities, labs) and **people** who maintain them, the **devices** they talk to, the
**technologies** they work with (EEG, MEG, fMRI, DBS, TMS…) and, for clinical technology, the
**indications** it diagnoses or treats.

Every technology is classed two ways, and everything connected to it inherits those classes:

- **sensing** or **modulating**
- **invasive** or **noninvasive**

The graph also records **gaps**: problems nobody has solved and projects that should exist but do not.
`REALLY_WANTS` edges point at them from whoever would benefit. Gaps that many parties want and that unlock
other things rise to the top of the open gaps board, and from there become scoped, timeboxed projects for
volunteer teams. The target is the pre-competitive glue that academic labs and startups have little incentive
to build: interoperability, benchmarks, data harmonisation and open re-implementations.

## The viewer

**Live at <https://johngriffiths.github.io/neurotech-ecosystem/>.** It is rebuilt from `main` on every push.
All seed data is unverified (see below and [docs/HANDOFF.md](docs/HANDOFF.md)).

To run it locally:

```
pip install -r requirements.txt
python tools/ntgraph.py build
python -m http.server -d dist      # http://localhost:8000
```

- The network opens in 3D: drag to rotate, scroll to zoom, right-drag to pan. It spins slowly until you
  take hold of it. Switch to a flat 2D layout with the toggle at the bottom; 2D is also the fallback where
  WebGL is unavailable.
- Click a node for its details, repository link and connections. Hover to light up its neighbourhood.
- Colour the network by entity type, by sensing versus modulating, or by invasiveness.
- Filter by entity type, class, invasiveness, a single technology, or clinical only.
- Press `/` to search. Link straight to a node with `#node-id`, or to the gaps board with `#gaps`.

## Layout

| Path | Contents |
|---|---|
| `graph/nodes/` | Projects, devices, organisations, people, technologies, indications, gaps |
| `graph/edges/` | Relationships; `gaps.yaml` holds the project-generating ones |
| `tools/ntgraph.py` | Validator, gap ranking and static site build |
| `web/` | The viewer. `vendor/` holds the 2D and 3D graph libraries (MIT) and the Orbitron font (OFL); see `web/vendor/README.md`. The logo, favicon and colour scheme come from the original NeuroTechX website and belong to NeuroTechX. |
| `docs/SCHEMA.md` | Node and edge types, verification rules, scoring |
| `docs/rfcs/` | Project proposals derived from the graph |

```
python tools/ntgraph.py validate     # check the graph
python tools/ntgraph.py bounties     # ranked gaps as a Markdown table
python tools/ntgraph.py check-repos  # confirm every project repo exists on GitHub
python -m pytest                     # tests
```

## Status of the seed data

**Every edge is currently `unverified`**, and nothing has been checked against a live source since it was
entered. There are two kinds of record:

- About 270 hand-written nodes (projects, people, devices, technologies and some organisations), seeded to
  exercise the schema and viewer.
- 537 companies imported from a snapshot of the NeuroTechX ecosystem database dated January 2022 at the
  latest. Some have since closed, merged or been renamed. `python tools/ntgraph.py stale` lists what still
  needs checking.

For the hand-written part:
That includes who maintains what, people's affiliations, clinical indications and their regulatory stage,
and above all the `REALLY_WANTS` edges, which are hypotheses that have not been confirmed with the party
named. Verifying them, and correcting what is wrong, is the job of the first cartography sprint.

## Picking this up

[AGENTS.md](AGENTS.md) orients an AI coding agent (or a person) to the repository.
[docs/HANDOFF.md](docs/HANDOFF.md) records the current state, decisions and open items, and
[docs/CONVERSATION.md](docs/CONVERSATION.md) the conversation that produced it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for roles (Cartographer, Architect, Builder, Sponsor), how to edit
the graph, and how a gap becomes a project.

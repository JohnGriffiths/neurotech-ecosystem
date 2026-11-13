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

```
pip install -r requirements.txt
python tools/ntgraph.py build
python -m http.server -d dist      # http://localhost:8000
```

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
| `web/` | The viewer. `vendor/` holds [force-graph](https://github.com/vasturiano/force-graph) (MIT) and the Orbitron font (OFL). The logo, favicon and colour scheme come from the original NeuroTechX website and belong to NeuroTechX. |
| `docs/SCHEMA.md` | Node and edge types, verification rules, scoring |
| `docs/rfcs/` | Project proposals derived from the graph |

```
python tools/ntgraph.py validate     # check the graph
python tools/ntgraph.py bounties     # ranked gaps as a Markdown table
python tools/ntgraph.py check-repos  # confirm every project repo exists on GitHub
python -m pytest                     # tests
```

## Status of the seed data

The graph was seeded by hand to exercise the schema and viewer. **Every edge is currently `unverified`.**
That includes who maintains what, people's affiliations, clinical indications and their regulatory stage,
and above all the `REALLY_WANTS` edges, which are hypotheses that have not been confirmed with the party
named. Verifying them, and correcting what is wrong, is the job of the first cartography sprint.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for roles (Cartographer, Architect, Builder, Sponsor), how to edit
the graph, and how a gap becomes a project.

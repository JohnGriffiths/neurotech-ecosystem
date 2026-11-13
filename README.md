# neurotech-ecosystem

A knowledge graph of the neurotechnology ecosystem, kept as YAML in Git, whose purpose is to generate
well-scoped open-source projects.

It maps who makes what, what depends on what, and which problems nobody has solved. The `REALLY_WANTS`
edges point from an actor or project to something that is missing. Gaps that many parties want and that
unlock other things rise to the top of the **bounty board**, and from there become scoped, timeboxed
projects for volunteer teams.

The target is the pre-competitive glue that academic labs and startups have little incentive to build:
interoperability, benchmarks, data harmonisation and open re-implementations.

## Layout

| Path | Contents |
|---|---|
| `graph/nodes/` | Actors, tech and problems |
| `graph/edges/` | Relationships; `gaps.yaml` holds the project-generating ones |
| `tools/ntgraph.py` | Validator, bounty ranking and static site build |
| `web/` | Bounty board and interactive graph viewer |
| `docs/SCHEMA.md` | Node and edge types, verification rules, scoring |
| `docs/rfcs/` | Project proposals derived from the graph |

## Use

```
pip install -r requirements.txt
python tools/ntgraph.py validate     # check the graph
python tools/ntgraph.py bounties     # ranked gaps as a Markdown table
python tools/ntgraph.py build        # static site in dist/
python -m http.server -d dist        # view at http://localhost:8000
```

## Status of the seed data

The graph was seeded by hand to exercise the schema and tooling. **Every edge is currently `unverified`.**
In particular, the `REALLY_WANTS` edges are hypotheses about what projects and organisations need; none has
been confirmed with the party named. Verifying them, and correcting what is wrong, is the job of the first
cartography sprint.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for roles (Cartographer, Architect, Builder, Sponsor), how to edit
the graph, and how a gap becomes a project.

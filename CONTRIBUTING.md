# Contributing

## Roles

Pick one. Nobody has to do everything.

| Role | What you do | Where |
|---|---|---|
| **Cartographer** | Add, correct and verify nodes and edges. Chase evidence for `REALLY_WANTS` edges. | `graph/` |
| **Architect / lead** | Turn a top-ranked gap into a scoped RFC, break it into issues, review pull requests. | `docs/rfcs/` |
| **Builder** | Pick up a scoped issue from an accepted RFC and ship it. | The project's own repository |
| **Sponsor** | An engineer or researcher from the lab or company that wants the thing. About one hour every two weeks reviewing the spec as the customer. No money involved. | RFC review |

## Editing the graph

1. Read [docs/SCHEMA.md](docs/SCHEMA.md).
2. Edit or add YAML under `graph/nodes/` and `graph/edges/`.
3. Check your work:

   ```
   pip install -r requirements.txt
   python tools/ntgraph.py validate
   python tools/ntgraph.py build && python -m http.server -d dist
   ```

4. Open a pull request. CI runs the same validation.

Ground rules:

- New edges are `unverified` unless you supply `evidence` and `verified_by`.
- Do not attribute a want to a company, lab or project without a public source or their say-so. If you
  believe the need exists but cannot source it, leave the edge `unverified`.
- To second an existing want, add your GitHub handle to that edge's `endorsed_by` list.
- Quote any YAML string containing a comma or colon.
- Not a Git user? Open an issue with the "I really want this" or "Graph correction" template.

## From gap to project

1. A gap rises on the bounty board.
2. A lead copies [docs/rfcs/0000-template.md](docs/rfcs/0000-template.md) and opens a pull request.
3. The RFC is accepted when it has an input/output contract, a definition of done, a timebox of eight
   weeks or less, a named lead, and at least one verified `REALLY_WANTS` edge behind it.
4. Builders work the issues. When it ships, a Cartographer adds the new tech node and an `ADDRESSES` edge,
   and the gap drops off the board.

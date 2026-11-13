#!/usr/bin/env python3
"""Load, validate and build the neurotech ecosystem knowledge graph.

    python tools/ntgraph.py validate          # check graph/ against the schema
    python tools/ntgraph.py bounties          # print the ranked bounty board
    python tools/ntgraph.py build [--out dist]  # write the static site

The schema lives in this file (NODE_KINDS, EDGE_RULES) and is described for
humans in docs/SCHEMA.md. Keep the two in step.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
GRAPH_DIR = ROOT / "graph"
WEB_DIR = ROOT / "web"

# ---------------------------------------------------------------- schema ---

NODE_KINDS = {
    "actor": {"company", "lab", "maintainer", "community", "standards_body", "regulator"},
    "tech": {"hardware", "software", "dataset", "standard"},
    "problem": {"bottleneck", "capability"},
}
LAYERS = {"hardware", "acquisition", "streaming", "processing", "ml", "experiment", "data", "standard"}
TECH_STATUS = {"exists", "proposed"}

# edge type -> (allowed source node types, allowed target node types)
EDGE_RULES = {
    "MAINTAINS": ({"actor"}, {"tech"}),
    "DEPENDS_ON": ({"tech"}, {"tech"}),
    "INTEGRATES_WITH": ({"tech"}, {"tech"}),
    "ADDRESSES": ({"tech"}, {"problem"}),
    "REALLY_WANTS": ({"actor", "tech"}, {"problem", "tech"}),
    "BLOCKS": ({"problem"}, {"problem"}),
}
EDGE_STATUS = {"unverified", "verified"}
COVERAGE = {"partial", "full"}

NODE_FIELDS = {"id", "type", "kind", "name", "url", "description", "layer", "status", "tags"}
EDGE_FIELDS = {"from", "to", "type", "status", "evidence", "verified_by", "note", "coverage", "endorsed_by"}
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


# --------------------------------------------------------------- loading ---

def _load_items(directory: Path, key: str, errors: list[str]) -> list[dict]:
    """Read every YAML file in `directory`, applying per-file `defaults`."""
    items = []
    for path in sorted(directory.glob("*.yaml")):
        rel = path.relative_to(GRAPH_DIR.parent) if path.is_relative_to(GRAPH_DIR.parent) else path
        try:
            doc = yaml.safe_load(path.read_text()) or {}
        except yaml.YAMLError as exc:
            errors.append(f"{rel}: invalid YAML: {exc}")
            continue
        if not isinstance(doc, dict) or not isinstance(doc.get(key), list):
            errors.append(f"{rel}: expected a mapping with a `{key}` list")
            continue
        defaults = doc.get("defaults") or {}
        for i, raw in enumerate(doc[key]):
            if not isinstance(raw, dict):
                errors.append(f"{rel}: {key}[{i}] is not a mapping")
                continue
            items.append({**defaults, **raw, "_src": f"{rel}:{key}[{i}]"})
    return items


def load(graph_dir: Path = GRAPH_DIR) -> tuple[list[dict], list[dict], list[str], list[str]]:
    """Return (nodes, edges, errors, warnings). The graph is usable iff errors is empty."""
    errors: list[str] = []
    warnings: list[str] = []
    nodes = _load_items(graph_dir / "nodes", "nodes", errors)
    edges = _load_items(graph_dir / "edges", "edges", errors)

    by_id: dict[str, dict] = {}
    for n in nodes:
        src = n["_src"]
        nid = n.get("id")
        if not isinstance(nid, str) or not ID_RE.match(nid):
            errors.append(f"{src}: id must be lowercase-kebab-case, got {nid!r}")
            continue
        if nid in by_id:
            errors.append(f"{src}: duplicate id {nid!r} (first at {by_id[nid]['_src']})")
            continue
        by_id[nid] = n
        for unknown in sorted(set(n) - NODE_FIELDS - {"_src"}):
            errors.append(f"{src}: unknown field {unknown!r}")
        ntype = n.get("type")
        if ntype not in NODE_KINDS:
            errors.append(f"{src}: type must be one of {sorted(NODE_KINDS)}, got {ntype!r}")
            continue
        if n.get("kind") not in NODE_KINDS[ntype]:
            errors.append(f"{src}: kind for {ntype} must be one of {sorted(NODE_KINDS[ntype])}, got {n.get('kind')!r}")
        for field in ("name", "description"):
            if not isinstance(n.get(field), str) or not n[field].strip():
                errors.append(f"{src}: missing {field}")
        if "url" in n and not str(n["url"]).startswith(("http://", "https://")):
            errors.append(f"{src}: url must be http(s)")
        if ntype == "tech":
            n.setdefault("status", "exists")
            if n["status"] not in TECH_STATUS:
                errors.append(f"{src}: status must be one of {sorted(TECH_STATUS)}")
            if n.get("layer") not in LAYERS:
                errors.append(f"{src}: tech needs a layer, one of {sorted(LAYERS)}")
        elif "status" in n or "layer" in n:
            errors.append(f"{src}: status/layer only apply to tech nodes")

    seen: dict[tuple, str] = {}
    connected: set[str] = set()
    for e in edges:
        src = e["_src"]
        for unknown in sorted(set(e) - EDGE_FIELDS - {"_src"}):
            errors.append(f"{src}: unknown field {unknown!r}")
        etype = e.get("type")
        if etype not in EDGE_RULES:
            errors.append(f"{src}: type must be one of {sorted(EDGE_RULES)}, got {etype!r}")
            continue
        a, b = by_id.get(e.get("from")), by_id.get(e.get("to"))
        if a is None or b is None:
            for end in ("from", "to"):
                if e.get(end) not in by_id:
                    errors.append(f"{src}: {end} {e.get(end)!r} is not a known node id")
            continue
        connected.update((a["id"], b["id"]))
        if a["id"] == b["id"]:
            errors.append(f"{src}: self-loop on {a['id']}")
        src_types, dst_types = EDGE_RULES[etype]
        if a["type"] not in src_types or b["type"] not in dst_types:
            errors.append(
                f"{src}: {etype} must go {'/'.join(sorted(src_types))} -> {'/'.join(sorted(dst_types))}, "
                f"got {a['type']} -> {b['type']}"
            )
        key = (a["id"], etype, b["id"])
        if key in seen:
            errors.append(f"{src}: duplicate edge (first at {seen[key]})")
        seen[key] = src

        e.setdefault("status", "unverified")
        if e["status"] not in EDGE_STATUS:
            errors.append(f"{src}: status must be one of {sorted(EDGE_STATUS)}")
        for field in ("evidence", "endorsed_by"):
            if field in e and not (isinstance(e[field], list) and all(isinstance(x, str) for x in e[field])):
                errors.append(f"{src}: {field} must be a list of strings")
        if e["status"] == "verified" and not (e.get("evidence") and e.get("verified_by")):
            errors.append(f"{src}: verified edges need both evidence and verified_by")
        if etype == "ADDRESSES":
            if e.get("coverage") not in COVERAGE:
                errors.append(f"{src}: ADDRESSES needs coverage: partial|full")
        elif "coverage" in e:
            errors.append(f"{src}: coverage only applies to ADDRESSES")
        if etype == "REALLY_WANTS":
            if b["type"] == "tech" and b.get("status") != "proposed":
                errors.append(f"{src}: REALLY_WANTS may only target a tech with status: proposed")
        elif "endorsed_by" in e:
            errors.append(f"{src}: endorsed_by only applies to REALLY_WANTS")
        if etype == "BLOCKS" and a.get("kind") == "capability":
            warnings.append(f"{src}: a capability blocking something is unusual; should {a['id']} be a bottleneck?")

    for nid in sorted(set(by_id) - connected):
        warnings.append(f"{by_id[nid]['_src']}: node {nid!r} has no edges")
    return nodes, edges, errors, warnings


# -------------------------------------------------------------- bounties ---

def bounties(nodes: list[dict], edges: list[dict]) -> list[dict]:
    """Rank open gaps: unsolved bottlenecks and proposed tech.

    demand  = distinct REALLY_WANTS sources + distinct endorsers
    unlocks = number of things this gap BLOCKS (for proposed tech: what the
              problems it would fully address block)
    score   = demand + unlocks
    A bottleneck is closed once an *existing* tech ADDRESSES it with full coverage.
    """
    by_id = {n["id"]: n for n in nodes}
    exists = lambda nid: by_id[nid].get("status", "exists") == "exists"

    out = []
    for n in nodes:
        is_gap = (n["type"] == "problem" and n["kind"] == "bottleneck") or (
            n["type"] == "tech" and n.get("status") == "proposed"
        )
        if not is_gap:
            continue
        nid = n["id"]
        solutions = [e for e in edges if e["type"] == "ADDRESSES" and e["to"] == nid and exists(e["from"])]
        if any(e["coverage"] == "full" for e in solutions):
            continue
        wants = [e for e in edges if e["type"] == "REALLY_WANTS" and e["to"] == nid]
        endorsers = sorted({h for e in wants for h in e.get("endorsed_by", [])})
        if n["type"] == "tech":
            solved = {e["to"] for e in edges if e["type"] == "ADDRESSES" and e["from"] == nid and e["coverage"] == "full"}
            unlocks = sorted({e["to"] for e in edges if e["type"] == "BLOCKS" and e["from"] in solved} | solved)
        else:
            unlocks = sorted(e["to"] for e in edges if e["type"] == "BLOCKS" and e["from"] == nid)
        wanted_by = sorted(e["from"] for e in wants)
        out.append({
            "id": nid,
            "name": n["name"],
            "kind": "proposed tech" if n["type"] == "tech" else "bottleneck",
            "description": n["description"],
            "wanted_by": wanted_by,
            "verified_wants": sum(e["status"] == "verified" for e in wants),
            "endorsed_by": endorsers,
            "unlocks": unlocks,
            "partial_solutions": [{"id": e["from"], "note": e.get("note", "")} for e in solutions],
            "score": len(wanted_by) + len(endorsers) + len(unlocks),
        })
    out.sort(key=lambda b: (-b["score"], -len(b["wanted_by"]), b["id"]))
    return out


# ---------------------------------------------------------------- output ---

def export(nodes: list[dict], edges: list[dict]) -> dict:
    strip = lambda d: {k: v for k, v in d.items() if k != "_src"}
    return {
        "nodes": [strip(n) for n in nodes],
        "edges": [strip(e) for e in edges],
        "bounties": bounties(nodes, edges),
    }


def bounties_markdown(nodes: list[dict], edges: list[dict]) -> str:
    names = {n["id"]: n["name"] for n in nodes}
    lines = ["| # | Gap | Score | Wanted by | Unlocks | Partial solutions |", "|---|---|---|---|---|---|"]
    for i, b in enumerate(bounties(nodes, edges), 1):
        fmt = lambda ids: ", ".join(names[x] for x in ids) or "–"
        lines.append(
            f"| {i} | **{b['name']}** (`{b['id']}`) | {b['score']} | {fmt(b['wanted_by'])} "
            f"| {fmt(b['unlocks'])} | {fmt([s['id'] for s in b['partial_solutions']])} |"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("validate", help="check the graph against the schema")
    sub.add_parser("bounties", help="print the ranked bounty board as Markdown")
    build = sub.add_parser("build", help="write the static site")
    build.add_argument("--out", default="dist", type=Path)
    args = parser.parse_args(argv)

    nodes, edges, errors, warnings = load()
    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)
    for e in errors:
        print(f"error: {e}", file=sys.stderr)
    if errors:
        print(f"\n{len(errors)} error(s)", file=sys.stderr)
        return 1

    if args.cmd == "validate":
        verified = sum(e["status"] == "verified" for e in edges)
        print(f"ok: {len(nodes)} nodes, {len(edges)} edges ({verified} verified), {len(warnings)} warning(s)")
    elif args.cmd == "bounties":
        print(bounties_markdown(nodes, edges))
    elif args.cmd == "build":
        out = args.out if args.out.is_absolute() else ROOT / args.out
        out.mkdir(parents=True, exist_ok=True)
        for f in WEB_DIR.iterdir():
            shutil.copy(f, out / f.name)
        (out / "graph.json").write_text(json.dumps(export(nodes, edges), indent=1))
        print(f"built {out}/ ({len(nodes)} nodes, {len(edges)} edges)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

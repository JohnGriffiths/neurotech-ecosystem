#!/usr/bin/env python3
"""Load, validate and build the neurotech ecosystem knowledge graph.

    python tools/ntgraph.py validate          # check graph/ against the schema
    python tools/ntgraph.py bounties          # print the ranked bounty board
    python tools/ntgraph.py build [--out dist]  # write the static site
    python tools/ntgraph.py check-repos       # confirm every project repo exists on GitHub

The schema lives in this file (NODE_KINDS, EDGE_RULES) and is described for
humans in docs/SCHEMA.md. Keep the two in step.
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
GRAPH_DIR = ROOT / "graph"
WEB_DIR = ROOT / "web"

# ---------------------------------------------------------------- schema ---

# node type -> allowed kinds (None: the type has no kinds)
NODE_KINDS = {
    "project": {"software", "hardware", "dataset", "standard", "resource"},
    "device": None,
    "org": {"company", "university", "institute", "lab", "oss_team", "community", "standards_body", "regulator"},
    "person": None,
    "modality": None,
    "indication": None,
    "problem": {"bottleneck", "capability"},
}
LAYERS = {"acquisition", "streaming", "processing", "modelling", "ml", "experiment", "data", "standard", "hardware", "community"}
PROJECT_STATUS = {"exists", "proposed"}
ORG_STATUS = {"active", "acquired", "defunct", "unknown"}
CLASSES = {"sensing", "modulating"}
INVASIVENESS = {"invasive", "noninvasive"}

# edge type -> (allowed source node types, allowed target node types)
EDGE_RULES = {
    "MAINTAINS": ({"org", "person"}, {"project", "device"}),
    "AFFILIATED_WITH": ({"person", "org"}, {"org"}),
    "DEPENDS_ON": ({"project"}, {"project"}),
    "INTEGRATES_WITH": ({"project"}, {"project", "device"}),
    "USES": ({"project", "device", "org"}, {"modality"}),
    "INDICATED_FOR": ({"device", "project", "modality"}, {"indication"}),
    "ADDRESSES": ({"project"}, {"problem"}),
    "REALLY_WANTS": ({"org", "person", "project"}, {"problem", "project"}),
    "BLOCKS": ({"problem"}, {"problem"}),
}
EDGE_STATUS = {"unverified", "verified"}
COVERAGE = {"partial", "full"}
STAGES = {"approved", "investigational"}

NODE_FIELDS = {"id", "type", "kind", "name", "url", "description", "tags",
               "source", "checked",                         # provenance: where a record came from, when last confirmed
               "country",                                   # org
               "repo", "layer", "status", "modalities",   # project (modalities also on device, org)
               "github",                                    # person
               "class", "invasiveness"}                     # modality
EDGE_FIELDS = {"from", "to", "type", "status", "evidence", "verified_by", "note", "coverage", "stage", "endorsed_by"}
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
CHECKED_RE = re.compile(r"^\d{4}(-\d{2}(-\d{2})?)?$")  # YYYY, YYYY-MM or YYYY-MM-DD


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
        kinds = NODE_KINDS[ntype]
        if kinds is None:
            if "kind" in n:
                errors.append(f"{src}: {ntype} nodes have no kind")
        elif n.get("kind") not in kinds:
            errors.append(f"{src}: kind for {ntype} must be one of {sorted(kinds)}, got {n.get('kind')!r}")
        for field in ("name", "description"):
            if not isinstance(n.get(field), str) or not n[field].strip():
                errors.append(f"{src}: missing {field}")

        allowed = {"project": {"repo", "layer", "status", "modalities"}, "device": {"modalities"}, "org": {"modalities", "status", "country"},
                   "person": {"github"}, "modality": {"class", "invasiveness"}}.get(ntype, set())
        for field in sorted({"repo", "layer", "status", "modalities", "github", "class", "invasiveness", "country"} - allowed):
            if field in n:
                errors.append(f"{src}: {field} does not apply to {ntype} nodes")

        if "checked" in n:
            n["checked"] = str(n["checked"])
            if not CHECKED_RE.match(n["checked"]):
                errors.append(f"{src}: checked must be YYYY, YYYY-MM or YYYY-MM-DD")
        if "source" in n and not isinstance(n["source"], str):
            errors.append(f"{src}: source must be a string")
        if ntype == "org" and "status" in n and n["status"] not in ORG_STATUS:
            errors.append(f"{src}: org status must be one of {sorted(ORG_STATUS)}")
        if ntype == "project":
            n.setdefault("status", "exists")
            if n["status"] not in PROJECT_STATUS:
                errors.append(f"{src}: status must be one of {sorted(PROJECT_STATUS)}")
            if n.get("layer") not in LAYERS:
                errors.append(f"{src}: project needs a layer, one of {sorted(LAYERS)}")
            if "repo" in n:
                if not isinstance(n["repo"], str) or not REPO_RE.match(n["repo"]):
                    errors.append(f"{src}: repo must be a GitHub owner/name, got {n['repo']!r}")
                else:
                    n.setdefault("url", f"https://github.com/{n['repo']}")
            elif n["status"] == "exists" and "url" not in n:
                errors.append(f"{src}: an existing project needs a repo (GitHub owner/name) or, failing that, a url")
        if ntype == "modality":
            cls = n.get("class")
            n["class"] = sorted(cls) if isinstance(cls, list) else [cls]
            if not n["class"] or not set(map(str, n["class"])) <= CLASSES:
                errors.append(f"{src}: class must be sensing, modulating or a list of both")
            if n.get("invasiveness") not in INVASIVENESS:
                errors.append(f"{src}: invasiveness must be one of {sorted(INVASIVENESS)}")
        if "url" in n and not str(n["url"]).startswith(("http://", "https://")):
            errors.append(f"{src}: url must be http(s)")
        if "tags" in n and not (isinstance(n["tags"], list) and all(isinstance(x, str) for x in n["tags"])):
            errors.append(f"{src}: tags must be a list of strings")
        if "modalities" in n and not (isinstance(n["modalities"], list) and all(isinstance(m, str) for m in n["modalities"])):
            errors.append(f"{src}: modalities must be a list of modality ids")
            n["modalities"] = []

    # `modalities: [eeg, meg]` on a project, device or org is shorthand for USES edges.
    for n in list(by_id.values()):
        for m in n.pop("modalities", []):
            edges.append({"from": n["id"], "type": "USES", "to": m, "_src": f"{n['_src']}.modalities"})

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
        if etype == "INDICATED_FOR":
            if e.get("stage") not in STAGES:
                errors.append(f"{src}: INDICATED_FOR needs stage: approved|investigational")
        elif "stage" in e:
            errors.append(f"{src}: stage only applies to INDICATED_FOR")
        if etype == "REALLY_WANTS":
            if b["type"] == "project" and b.get("status") != "proposed":
                errors.append(f"{src}: REALLY_WANTS may only target a project with status: proposed")
        elif "endorsed_by" in e:
            errors.append(f"{src}: endorsed_by only applies to REALLY_WANTS")
        if etype == "BLOCKS" and a.get("kind") == "capability":
            warnings.append(f"{src}: a capability blocking something is unusual; should {a['id']} be a bottleneck?")

    isolated = sorted(set(by_id) - connected)
    if len(isolated) > 10:
        warnings.append(f"{len(isolated)} nodes have no edges (run `stale --isolated` to list them)")
    else:
        for nid in isolated:
            warnings.append(f"{by_id[nid]['_src']}: node {nid!r} has no edges")
    return nodes, edges, errors, warnings


# -------------------------------------------------------------- bounties ---

def bounties(nodes: list[dict], edges: list[dict]) -> list[dict]:
    """Rank open gaps: unsolved bottlenecks and proposed projects.

    demand  = distinct REALLY_WANTS sources + distinct endorsers
    unlocks = number of things this gap BLOCKS (for proposed projects: what the
              problems it would fully address block)
    score   = demand + unlocks
    A bottleneck is closed once an *existing* project ADDRESSES it with full coverage.
    """
    by_id = {n["id"]: n for n in nodes}
    exists = lambda nid: by_id[nid].get("status", "exists") == "exists"

    out = []
    for n in nodes:
        is_gap = (n["type"] == "problem" and n["kind"] == "bottleneck") or (
            n["type"] == "project" and n.get("status") == "proposed"
        )
        if not is_gap:
            continue
        nid = n["id"]
        solutions = [e for e in edges if e["type"] == "ADDRESSES" and e["to"] == nid and exists(e["from"])]
        if any(e["coverage"] == "full" for e in solutions):
            continue
        wants = [e for e in edges if e["type"] == "REALLY_WANTS" and e["to"] == nid]
        endorsers = sorted({h for e in wants for h in e.get("endorsed_by", [])})
        if n["type"] == "project":
            solved = {e["to"] for e in edges if e["type"] == "ADDRESSES" and e["from"] == nid and e["coverage"] == "full"}
            unlocks = sorted({e["to"] for e in edges if e["type"] == "BLOCKS" and e["from"] in solved} | solved)
        else:
            unlocks = sorted(e["to"] for e in edges if e["type"] == "BLOCKS" and e["from"] == nid)
        wanted_by = sorted(e["from"] for e in wants)
        out.append({
            "id": nid,
            "name": n["name"],
            "kind": "proposed project" if n["type"] == "project" else "bottleneck",
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

def derive(nodes: list[dict], edges: list[dict]) -> dict[str, dict]:
    """Per-node facets inherited through the graph, used by the viewer's filters.

    A project or device takes its class (sensing/modulating) and invasiveness from the
    modalities it USES; orgs and people from what they maintain and where they are
    affiliated; indications from what is INDICATED_FOR them; gaps from the projects
    that address or want them. `clinical` marks anything
    with, or one maintenance hop from, an INDICATED_FOR edge.
    """
    by_id = {n["id"]: n for n in nodes}
    facets = {nid: {"class": set(), "invasiveness": set(), "modalities": set(), "clinical": False} for nid in by_id}
    for n in nodes:
        if n["type"] == "modality":
            f = facets[n["id"]]
            f["class"].update(n["class"]); f["invasiveness"].add(n["invasiveness"]); f["modalities"].add(n["id"])

    def inherit(dst: str, src: str) -> None:
        for key in ("class", "invasiveness", "modalities"):
            facets[dst][key] |= facets[src][key]
        facets[dst]["clinical"] |= facets[src]["clinical"]

    of = lambda etype: [e for e in edges if e["type"] == etype]
    for e in of("USES"):
        inherit(e["from"], e["to"])
    for e in of("INDICATED_FOR"):
        facets[e["from"]]["clinical"] = True
    for e in of("INDICATED_FOR"):
        inherit(e["to"], e["from"]); facets[e["to"]]["clinical"] = True
    for e in of("MAINTAINS"):
        inherit(e["from"], e["to"])
    for etype in ("ADDRESSES", "REALLY_WANTS", "BLOCKS"):  # a gap takes the facets of who it concerns
        for e in of(etype):
            inherit(e["to"], e["from"])
    for _ in range(3):  # person -> team -> lab -> university
        for e in of("AFFILIATED_WITH"):
            inherit(e["to"], e["from"])
    for e in of("AFFILIATED_WITH"):
        if by_id[e["from"]]["type"] == "person":
            inherit(e["from"], e["to"])
    return {nid: {k: sorted(v) if isinstance(v, set) else v for k, v in f.items()} for nid, f in facets.items()}


def export(nodes: list[dict], edges: list[dict]) -> dict:
    strip = lambda d: {k: v for k, v in d.items() if k != "_src"}
    facets = derive(nodes, edges)
    return {
        "nodes": [{**strip(n), "facets": facets[n["id"]]} for n in nodes],
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


def stale(nodes: list[dict], before: int) -> dict[str, list[dict]]:
    """Orgs, devices and projects whose record was last confirmed before `before` (a year), or never.

    Returned grouped by `source` ("" for hand-written records) so an update pass can be planned per source.
    """
    groups: dict[str, list[dict]] = {}
    for n in nodes:
        if n["type"] not in {"org", "device", "project"} or n.get("status") == "proposed":
            continue
        if int(n.get("checked", "0")[:4]) < before:
            groups.setdefault(n.get("source", ""), []).append(n)
    return groups


def check_repos(nodes: list[dict]) -> list[str]:
    """Return the `repo` values that `git ls-remote` cannot reach (missing, renamed away or private)."""
    missing = []
    for n in nodes:
        if n.get("repo"):
            result = subprocess.run(
                ["git", "ls-remote", "--exit-code", f"https://github.com/{n['repo']}", "HEAD"],
                capture_output=True, timeout=60, env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
            )
            if result.returncode != 0:
                missing.append(f"{n['id']}: {n['repo']}")
    return missing


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("validate", help="check the graph against the schema")
    sub.add_parser("bounties", help="print the ranked bounty board as Markdown")
    stale_p = sub.add_parser("stale", help="list organisations, devices and projects not confirmed recently")
    stale_p.add_argument("--before", type=int, default=datetime.date.today().year, help="year; default this year")
    stale_p.add_argument("--list", action="store_true", help="print every record, not just counts")
    stale_p.add_argument("--isolated", action="store_true", help="list nodes with no edges instead")
    sub.add_parser("check-repos", help="confirm every project repo exists on GitHub (needs network)")
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
    elif args.cmd == "stale":
        if args.isolated:
            linked = {e[k] for e in edges for k in ("from", "to")}
            for n in nodes:
                if n["id"] not in linked:
                    print(f"{n['type']:10} {n['id']}")
            return 0
        groups = stale(nodes, args.before)
        total = sum(len(v) for v in groups.values())
        tracked = sum(1 for n in nodes if n["type"] in {"org", "device", "project"} and n.get("status") != "proposed")
        print(f"{total} of {tracked} organisations, devices and projects not confirmed since {args.before}")
        for source, items in sorted(groups.items(), key=lambda kv: -len(kv[1])):
            never = sum(1 for n in items if "checked" not in n)
            print(f"  {source or '(hand-written)':28} {len(items):4}  ({never} never checked)")
            if args.list:
                for n in sorted(items, key=lambda n: n["id"]):
                    print(f"      {n.get('checked', 'never'):10} {n['type']:8} {n['id']}  {n.get('url', '')}")
    elif args.cmd == "check-repos":
        missing = check_repos(nodes)
        for m in missing:
            print(f"not found: {m}", file=sys.stderr)
        total = sum(1 for n in nodes if n.get("repo"))
        print(f"{total - len(missing)} of {total} repos reachable")
        return 1 if missing else 0
    elif args.cmd == "bounties":
        print(bounties_markdown(nodes, edges))
    elif args.cmd == "build":
        out = args.out if args.out.is_absolute() else ROOT / args.out
        out.mkdir(parents=True, exist_ok=True)
        shutil.copytree(WEB_DIR, out, dirs_exist_ok=True)
        (out / "graph.json").write_text(json.dumps(export(nodes, edges), indent=1))
        print(f"built {out}/ ({len(nodes)} nodes, {len(edges)} edges)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

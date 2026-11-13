import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import ntgraph  # noqa: E402

NODES = [
    {"id": "lab", "type": "actor", "kind": "lab", "name": "Lab", "description": "d"},
    {"id": "lib", "type": "tech", "kind": "software", "layer": "processing", "name": "Lib", "description": "d"},
    {"id": "idea", "type": "tech", "kind": "software", "layer": "processing", "status": "proposed",
     "name": "Idea", "description": "d"},
    {"id": "gap", "type": "problem", "kind": "bottleneck", "name": "Gap", "description": "d"},
    {"id": "goal", "type": "problem", "kind": "capability", "name": "Goal", "description": "d"},
]


def write_graph(tmp_path, edges, nodes=NODES):
    (tmp_path / "nodes").mkdir()
    (tmp_path / "edges").mkdir()
    (tmp_path / "nodes" / "n.yaml").write_text(yaml.safe_dump({"nodes": nodes}))
    (tmp_path / "edges" / "e.yaml").write_text(yaml.safe_dump({"edges": edges}))
    return ntgraph.load(tmp_path)


def test_seed_graph_is_valid():
    nodes, edges, errors, _ = ntgraph.load()
    assert errors == []
    assert len(nodes) >= 50
    assert ntgraph.bounties(nodes, edges)


def test_edge_endpoint_types_enforced(tmp_path):
    *_, errors, _ = write_graph(tmp_path, [{"from": "lab", "type": "DEPENDS_ON", "to": "lib"}])
    assert any("DEPENDS_ON must go tech -> tech" in e for e in errors)


def test_unknown_node_and_duplicate_edge(tmp_path):
    edge = {"from": "lab", "type": "MAINTAINS", "to": "lib"}
    *_, errors, _ = write_graph(tmp_path, [edge, edge, {"from": "lab", "type": "MAINTAINS", "to": "nope"}])
    assert any("duplicate edge" in e for e in errors)
    assert any("'nope' is not a known node id" in e for e in errors)


def test_verified_needs_evidence(tmp_path):
    *_, errors, _ = write_graph(
        tmp_path, [{"from": "lab", "type": "REALLY_WANTS", "to": "gap", "status": "verified"}]
    )
    assert any("verified edges need both evidence and verified_by" in e for e in errors)


def test_really_wants_existing_tech_rejected(tmp_path):
    *_, errors, _ = write_graph(tmp_path, [{"from": "lab", "type": "REALLY_WANTS", "to": "lib"}])
    assert any("status: proposed" in e for e in errors)


def test_bounty_scoring_and_closure(tmp_path):
    edges = [
        {"from": "lab", "type": "REALLY_WANTS", "to": "gap", "endorsed_by": ["@a", "@b"]},
        {"from": "lib", "type": "REALLY_WANTS", "to": "gap"},
        {"from": "gap", "type": "BLOCKS", "to": "goal"},
        {"from": "lib", "type": "ADDRESSES", "to": "gap", "coverage": "partial"},
        {"from": "idea", "type": "ADDRESSES", "to": "gap", "coverage": "full"},
    ]
    nodes, loaded, errors, _ = write_graph(tmp_path, edges)
    assert errors == []
    board = {b["id"]: b for b in ntgraph.bounties(nodes, loaded)}
    # A proposed tech does not close the gap; it is itself a bounty.
    assert board["gap"]["score"] == 2 + 2 + 1
    assert board["gap"]["partial_solutions"] == [{"id": "lib", "note": ""}]
    assert board["idea"]["unlocks"] == ["gap", "goal"]

    # Once an existing tech fully addresses it, the gap leaves the board.
    loaded.append({"from": "lib", "type": "ADDRESSES", "to": "gap", "coverage": "full", "status": "unverified"})
    loaded[:] = [e for e in loaded if not (e["from"] == "lib" and e.get("coverage") == "partial")]
    assert "gap" not in {b["id"] for b in ntgraph.bounties(nodes, loaded)}

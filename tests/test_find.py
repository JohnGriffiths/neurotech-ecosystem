import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import ntgraph  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_finder_ranks_and_explains(tmp_path):
    nodes, edges, errors, _ = ntgraph.load()
    assert errors == []
    exported = tmp_path / "graph.json"
    exported.write_text(json.dumps(ntgraph.export(nodes, edges)))
    result = subprocess.run(["node", str(ROOT / "tests" / "find_check.js"), str(exported)], capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr


def test_github_facts_cover_every_project_repo():
    nodes, edges, _, _ = ntgraph.load()
    exported = {n["id"]: n for n in ntgraph.export(nodes, edges)["nodes"]}
    with_repo = [n for n in nodes if n.get("repo")]
    assert with_repo and all("github" in exported[n["id"]] for n in with_repo)
    assert exported["mne-python"]["github"]["language"] == "Python"

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
def test_every_demo_step_refers_to_things_that_exist(tmp_path):
    nodes, edges, errors, _ = ntgraph.load()
    assert errors == []
    exported = tmp_path / "graph.json"
    exported.write_text(json.dumps(ntgraph.export(nodes, edges)))
    result = subprocess.run(["node", str(ROOT / "tests" / "demos_check.js"), str(exported)], capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr

#!/usr/bin/env python3
"""Import companies from an export of the NeuroTechX ecosystem database (2022 snapshot).

    python tools/import_ntx_ecosystem.py path/to/companies.csv

Expects columns: name, website, type, technology, applications, city, country, with "|"-separated tag
names in the three tag columns. Writes graph/nodes/orgs-ntx-ecosystem.yaml and prints what it did.

Only company-level public facts are imported: name, website, country, and the source's own tags. Rows
that match an organisation already in the graph (by website domain or name) are skipped, not merged.
Every imported record carries `source: ntx-ecosystem-2022`, `checked: "2022"` and `status: unknown`, so
`python tools/ntgraph.py stale` lists them as needing an update.
"""
from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "graph" / "nodes" / "orgs-ntx-ecosystem.yaml"
SOURCE = "ntx-ecosystem-2022"

# Source technology tag -> modality id in graph/nodes/modalities.yaml. Deliberately conservative: a tag
# is mapped only when it names one of our technologies unambiguously.
MODALITY = {
    "Electroencephalography (EEG)": "eeg", "ear-EEG (electroencephalography)": "eeg",
    "Event-related Potentials (ERP)": "eeg", "Evoked potentials": "eeg", "Polysomnography (PSG)": "eeg",
    "Electromyography (EMG)": "emg",
    "Electrocorticography (ECoG)": "ecog",
    "Magnetoencephalography (MEG)": "meg",
    "fMRI (functional Magnetic Resonance Imaging)": "fmri",
    "Magnetic Resonance Imaging (MRI)": "smri", "Magnetic Resonance Imaging (MRI) analysis": "smri",
    "Functional near-infrared spectroscopy (fNIRS)": "fnirs", "Near-Infrared Spectroscopy (NIRS)": "fnirs",
    "Transcranial Direct Current Stimulation (tDCS)": "tes",
    "Transcranial Magnetic Stimulation (TMS)": "tms", "Magnetic stimulation": "tms",
    "Deep Brain Stimulation": "dbs",
    "Spinal cord stimulation": "scs",
    "Invasive Recording": "intracortical",
}

COUNTRY = {
    "us": "United States", "usa": "United States", "united states": "United States", "u.s.": "United States",
    "uk": "United Kingdom", "united kingdom": "United Kingdom", "england": "United Kingdom", "scotland": "United Kingdom",
    "nl": "Netherlands", "the netherlands": "Netherlands", "holland": "Netherlands",
    "slovak republic": "Slovakia", "south korea": "South Korea", "korea": "South Korea",
    "united arab emirates (uae)": "United Arab Emirates", "uae": "United Arab Emirates",
}
KIND_NOTE = {"Hardware", "Software", "Services", "Medical device", "Pharma", "Biotechnology", "Digital Therapeutics",
             "Digital Health", "Consumables", "Biomedical instruments", "Medical products", "Surgical products",
             "Software as medicine", "Telemedicine"}


def slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = text.replace("&", " and ").replace("+", " plus ")
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def domain(url: str) -> str:
    url = re.sub(r"^https?://", "", (url or "").strip().lower())
    return re.sub(r"^www\.", "", url).split("/")[0].split("?")[0]


def tags(cell: str) -> list[str]:
    return [t.strip() for t in (cell or "").split("|") if t.strip()]


def countries(cell: str) -> list[str]:
    """Split a free-text country cell and normalise each part. Unrecognised text is kept as written."""
    out = []
    for part in re.split(r"\s*(?:/|;|,| and )\s*", (cell or "").strip()):
        if not part or part.upper() == "N/A":
            continue
        name = COUNTRY.get(part.lower(), part if part[:1].isupper() else part.title())
        if name not in out:
            out.append(name)
    return out


def main(path: str) -> int:
    existing = [n for f in sorted((ROOT / "graph" / "nodes").glob("*.yaml")) if f != OUT
                for n in (yaml.safe_load(f.read_text()) or {}).get("nodes", [])]
    taken_ids = {n["id"] for n in existing}
    org_domains = {domain(n.get("url", "")): n["id"] for n in existing if n.get("url")}
    org_names = {slug(n["name"]): n["id"] for n in existing}
    org_names.update({n["id"]: n["id"] for n in existing})

    nodes: dict[str, dict] = {}
    skipped, merged, unmapped = [], [], 0
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            name = row["name"].strip()
            nid = slug(name)
            if not nid:
                continue
            url = row["website"].strip()
            if url and not url.startswith(("http://", "https://")):
                url = "https://" + url
            match = org_names.get(nid) or (org_domains.get(domain(url)) if domain(url) else None)
            if match:
                skipped.append((name, match))
                continue
            if nid in taken_ids:  # same id as a non-org node (e.g. a project): keep them apart
                nid += "-company"
            tech, apps, types = tags(row["technology"]), tags(row["applications"]), tags(row["type"])
            mods = sorted({MODALITY[t] for t in tech + apps if t in MODALITY})
            if nid in nodes:  # the source lists some companies twice: union their tags
                node = nodes[nid]
                node["_tech"] = list(dict.fromkeys(node["_tech"] + tech))
                node["_apps"] = list(dict.fromkeys(node["_apps"] + apps))
                node["_types"] = list(dict.fromkeys(node["_types"] + types))
                node["modalities"] = sorted(set(node.get("modalities", [])) | set(mods))
                merged.append(name)
                continue
            node = {"id": nid, "kind": "company", "name": name, "_tech": tech, "_apps": apps, "_types": types}
            if url:
                node["url"] = url
            where = countries(row["country"])
            if where:
                node["country"] = ", ".join(where)
            if mods:
                node["modalities"] = mods
            nodes[nid] = node

    lines = [
        "# GENERATED by tools/import_ntx_ecosystem.py from a 2022 snapshot of the NeuroTechX ecosystem database.",
        "# Company-level fields only. Records are as of early 2022 at the latest: companies may since have",
        "# closed, merged or been renamed. When you confirm one, set `checked` to the date, set `status`, and",
        "# move it into orgs.yaml so a re-import does not overwrite it.",
        f'defaults: {{type: org, kind: company, source: {SOURCE}, checked: "2022", status: unknown}}',
        "nodes:",
    ]
    for node in sorted(nodes.values(), key=lambda n: n["id"]):
        tech, apps, types = node.pop("_tech"), node.pop("_apps"), node.pop("_types")
        parts = [", ".join(types)] if types else []
        if tech:
            parts.append("Technology: " + ", ".join(tech[:5]))
        if apps:
            parts.append("Applications: " + ", ".join(apps[:5]))
        node["description"] = ". ".join(parts) + "." if parts else "Listed in the NeuroTechX ecosystem database."
        node["tags"] = list(dict.fromkeys(t for t in tech + apps if t not in KIND_NOTE))[:12]
        if not node["tags"]:
            del node["tags"]
        if "modalities" not in node:
            unmapped += 1
        del node["kind"]  # supplied by the file defaults
        lines.append("  - " + json.dumps(node, ensure_ascii=False))  # JSON is valid YAML flow syntax
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"wrote {OUT.relative_to(ROOT)}: {len(nodes)} companies")
    print(f"  {len(nodes) - unmapped} linked to at least one technology, {unmapped} with none")
    print(f"  {len(merged)} duplicate rows merged: {', '.join(merged) or '-'}")
    print(f"  {len(skipped)} rows skipped as already in the graph:")
    for name, match in skipped:
        print(f"      {name} -> {match}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))

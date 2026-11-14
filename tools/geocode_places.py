#!/usr/bin/env python3
"""Resolve organisation cities and countries to coordinates for the viewer's Map layout.

    pip install geonamescache
    python tools/geocode_places.py

Reads every organisation's city and country (after graph/locations.yaml is applied), looks each distinct
place up in the GeoNames gazetteer bundled in the `geonamescache` package (cities of 15,000 people or more),
and writes graph/places.json:

    "Montreal|Canada": [45.5, -73.58, "city"]     # the largest city of that name in that country
    "|Canada":         [52.1, -91.2, "country"]   # population-weighted centre of the country's cities

A place that cannot be found as a city falls back to its country. The unresolved ones are printed so they
can be fixed by hand in locations.yaml or the import. Re-run after adding or changing locations.

GeoNames data is licensed CC BY 4.0 (https://www.geonames.org). Attribution is in the README.
"""
from __future__ import annotations

import json
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

import geonamescache

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ntgraph  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "graph" / "places.json"

COUNTRY_ALIASES = {"czech republic": "CZ", "czechia": "CZ", "uk": "GB", "united kingdom": "GB", "usa": "US",
                   "united states": "US", "south korea": "KR", "russia": "RU", "hong kong": "HK", "taiwan": "TW",
                   "slovakia": "SK", "slovak republic": "SK", "ireland": "IE", "republic of ireland": "IE",
                   "united arab emirates": "AE", "uae": "AE", "the netherlands": "NL", "netherlands": "NL",
                   "trinidad and tobago": "TT", "serbia": "RS", "tawain": "TW"}


# Towns too small for the 15,000-person gazetteer, so located by hand (approximate, from memory).
MANUAL = {
    "Schiedlberg|Austria": (48.07, 14.28), "Whitland|United Kingdom": (51.82, -4.62),
    "Malvern|United States": (40.04, -75.51), "Randersacker|Germany": (49.75, 9.99),
    "Risskov|Denmark": (56.19, 10.23), "Hronov|Czech Republic": (50.48, 16.18),
    "Korneuburg|Austria": (48.35, 16.33), "Valbonne|France": (43.64, 7.01), "Martillac|France": (44.70, -0.45),
    "Ecouen|France": (49.01, 2.38), "Boecillo|Spain": (41.51, -4.72), "Braine-le-Château|Belgium": (50.68, 4.27),
    "Bad Ems|Germany": (50.34, 7.71), "Buckingham|United Kingdom": (52.00, -0.99),
    "California City|United States": (35.13, -117.99), "Valencia|United States": (34.44, -118.60),
    "Gilching|Germany": (48.11, 11.30), "Ashburn|United States": (39.04, -77.49), "Elst|Netherlands": (51.92, 5.85),
    "Oldenzaal|Netherlands": (52.31, 6.93), "Farum|Denmark": (55.81, 12.36), "Benicia|United States": (38.05, -122.16),
}


def fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " ".join(text.lower().replace("-", " ").replace(".", " ").split())


def main() -> int:
    gc = geonamescache.GeonamesCache()
    iso_by_name = {fold(c["name"]): iso for iso, c in gc.get_countries().items()}
    iso_by_name.update(COUNTRY_ALIASES)

    by_country_name: dict[tuple[str, str], list[dict]] = defaultdict(list)
    by_country: dict[str, list[dict]] = defaultdict(list)
    for city in gc.get_cities().values():
        cc = city["countrycode"]
        by_country[cc].append(city)
        for name in [city["name"], *city.get("alternatenames", [])]:
            by_country_name[(cc, fold(name))].append(city)

    nodes, _, errors, _ = ntgraph.load()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1

    wanted = set()
    for n in nodes:
        if n["type"] == "org" and n.get("country"):
            wanted.add((n.get("city", ""), n["country"].split(",")[0].strip()))

    places: dict[str, list] = {}
    unresolved = []
    for city, country in sorted(wanted):
        iso = iso_by_name.get(fold(country))
        if not iso:
            unresolved.append(f"country not recognised: {country!r} (city {city!r})")
            continue
        if f"{city}|{country}" in MANUAL:
            lat, lon = MANUAL[f"{city}|{country}"]
            places[f"{city}|{country}"] = [lat, lon, "city"]
            continue
        if city:
            hits = by_country_name.get((iso, fold(city)))
            if hits:
                best = max(hits, key=lambda c: c["population"])
                places[f"{city}|{country}"] = [round(best["latitude"], 3), round(best["longitude"], 3), "city"]
                continue
            unresolved.append(f"city not found, using country: {city}, {country}")
        key = f"|{country}"
        if key not in places:
            cities = [c for c in by_country[iso] if c["population"] >= 100_000] or by_country[iso]
            if not cities:
                unresolved.append(f"no cities for country {country!r}")
                continue
            total = sum(c["population"] for c in cities)
            lat = sum(c["latitude"] * c["population"] for c in cities) / total
            lon = sum(c["longitude"] * c["population"] for c in cities) / total
            places[key] = [round(lat, 3), round(lon, 3), "country"]

    OUT.write_text(json.dumps({"note": "Generated by tools/geocode_places.py from GeoNames (CC BY 4.0).", "places": places},
                              ensure_ascii=False, separators=(",", ":"), sort_keys=True))
    kinds = [v[2] for v in places.values()]
    print(f"{len(places)} places ({kinds.count('city')} cities, {kinds.count('country')} country-level) -> {OUT.relative_to(ROOT)}")
    for line in unresolved:
        print("  ", line)
    return 0


if __name__ == "__main__":
    sys.exit(main())

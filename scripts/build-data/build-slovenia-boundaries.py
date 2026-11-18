"""Generate statistical region names and compact boundaries from the GURS Register of Spatial Units.

Download as EPSG:4326 GeoJSON with SIFRA and NAZIV from the Geohub MapServer statistical regions layer (1520).
Surveying and Mapping Authority of the Republic of Slovenia, CC BY 4.0. See docs/validation.md.
"""
import argparse
import json
from pathlib import Path

from shapely import get_coordinates
from shapely.geometry import shape


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("geojson", type=Path)
    args = parser.parse_args()
    regions = {}
    boundaries = {}
    for feature in json.loads(args.geojson.read_text())["features"]:
        properties = feature["properties"]
        code = f"SI-SR{properties['SIFRA']:02d}"
        if code in regions:
            raise ValueError(f"Duplicate statistical region: {code}")
        regions[code] = properties["NAZIV"]
        geometry = shape(feature["geometry"]).simplify(0.001, preserve_topology=True)
        polygons = [geometry] if geometry.geom_type == "Polygon" else geometry.geoms
        boundaries[code] = [
            [[[round(float(x), 5), round(float(y), 5)] for x, y in get_coordinates(ring)]
             for ring in [polygon.exterior, *polygon.interiors]]
            for polygon in polygons
        ]
    if regions.keys() != {f"SI-SR{code:02d}" for code in range(1, 13)}:
        raise ValueError("Expected all 12 official statistical regions of Slovenia.")
    for filename, data in [("data/slovenia-statistical-regions.json", regions),
                           ("public/data/slovenia-boundaries.v1.json", boundaries)]:
        Path(filename).write_text(json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()

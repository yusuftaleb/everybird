"""Build the browser's Vietnam ADM1 fallback from OCHA's 2025 COD-AB GeoJSON.

Pass vnm_admin1.geojson from https://data.humdata.org/dataset/cod-ab-vnm.
Data by the General Statistics Office of Vietnam, published by OCHA/HDX
under CC BY 3.0 IGO. Simplified to 0.001 degrees and rounded to 5 decimals.
"""
import argparse
import json
from pathlib import Path

from shapely import get_coordinates
from shapely.geometry import shape


def polygon_rings(polygon):
    return [
        [[round(float(x), 5), round(float(y), 5)] for x, y in get_coordinates(ring)]
        for ring in [polygon.exterior, *polygon.interiors]
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("geojson", type=Path)
    args = parser.parse_args()
    features = json.loads(args.geojson.read_text())["features"]
    provinces = {}
    for feature in features:
        properties = feature["properties"]
        code = properties["adm1_pcode"]
        if len(code) != 4 or not code.startswith("VN") or properties["version"] != "v02":
            raise ValueError(f"Unexpected Vietnam ADM1 record: {code}")
        geometry = shape(feature["geometry"]).simplify(0.001, preserve_topology=True)
        polygons = [geometry] if geometry.geom_type == "Polygon" else geometry.geoms
        provinces["VN-V" + code[2:]] = [polygon_rings(polygon) for polygon in polygons]
    if len(provinces) != 34:
        raise ValueError(f"Expected 34 provinces, read {len(provinces)}")
    Path("public/data/vietnam-boundaries.v1.json").write_text(
        json.dumps(provinces, sort_keys=True, separators=(",", ":")) + "\n"
    )


if __name__ == "__main__":
    main()

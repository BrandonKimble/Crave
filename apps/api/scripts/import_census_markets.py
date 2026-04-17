#!/usr/bin/env python3
import argparse
import csv
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import zipfile
from pathlib import Path
from typing import List, Optional

import shapefile


TIGER_BASE_URL = "https://www2.census.gov/geo/tiger"
DEFAULT_YEAR = "2025"
ALL_STATE_CODES = [
    "01",
    "02",
    "04",
    "05",
    "06",
    "08",
    "09",
    "10",
    "11",
    "12",
    "13",
    "15",
    "16",
    "17",
    "18",
    "19",
    "20",
    "21",
    "22",
    "23",
    "24",
    "25",
    "26",
    "27",
    "28",
    "29",
    "30",
    "31",
    "32",
    "33",
    "34",
    "35",
    "36",
    "37",
    "38",
    "39",
    "40",
    "41",
    "42",
    "44",
    "45",
    "46",
    "47",
    "48",
    "49",
    "50",
    "51",
    "53",
    "54",
    "55",
    "56",
]


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def run(command: List[str], input_text: Optional[str] = None) -> None:
    completed = subprocess.run(
        command,
        input=input_text,
        text=True,
        check=False,
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)


def download_zip(url: str, out_path: Path) -> None:
    run(["curl", "-Ls", url, "-o", str(out_path)])


def extract_shapefile(zip_path: Path, extract_dir: Path) -> Path:
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(extract_dir)
    shp_files = list(extract_dir.glob("*.shp"))
    if not shp_files:
        raise RuntimeError(f"No shapefile found in {zip_path}")
    return shp_files[0]


def normalize_float(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return text


def short_market_name(full_name: str) -> str:
    base = full_name.split(",")[0].strip()
    parts = [part.strip() for part in base.split("-") if part.strip()]
    if not parts:
        return full_name.strip()
    if len(parts) == 1:
        return parts[0]
    if len(parts) == 2:
        return base
    return parts[0]


def write_cbsa_csv(shp_path: Path, csv_path: Path, year: str) -> int:
    reader = shapefile.Reader(str(shp_path))
    with csv_path.open("w", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "cbsa_code",
                "name",
                "short_name",
                "cbsa_type",
                "country_code",
                "state_codes",
                "center_latitude",
                "center_longitude",
                "bbox_ne_latitude",
                "bbox_ne_longitude",
                "bbox_sw_latitude",
                "bbox_sw_longitude",
                "geometry",
                "metadata",
            ],
        )
        writer.writeheader()
        for shape_record in reader.iterShapeRecords():
            record = shape_record.record.as_dict()
            shape = shape_record.shape
            min_lng, min_lat, max_lng, max_lat = shape.bbox
            cbsa_type = "metro" if record.get("LSAD") == "M1" else "micro"
            name = str(record.get("NAME") or "").strip()
            writer.writerow(
                {
                    "cbsa_code": str(record.get("CBSAFP") or "").strip(),
                    "name": name,
                    "short_name": short_market_name(name),
                    "cbsa_type": cbsa_type,
                    "country_code": "US",
                    "state_codes": "",
                    "center_latitude": normalize_float(record.get("INTPTLAT")),
                    "center_longitude": normalize_float(record.get("INTPTLON")),
                    "bbox_ne_latitude": normalize_float(max_lat),
                    "bbox_ne_longitude": normalize_float(max_lng),
                    "bbox_sw_latitude": normalize_float(min_lat),
                    "bbox_sw_longitude": normalize_float(min_lng),
                    "geometry": json.dumps(shape.__geo_interface__),
                    "metadata": json.dumps(
                        {
                            "source": "census_tiger",
                            "dataset": "cbsa",
                            "year": year,
                            "namelsad": record.get("NAMELSAD"),
                            "lsad": record.get("LSAD"),
                            "geoidfq": record.get("GEOIDFQ"),
                        }
                    ),
                }
            )
    return len(reader)


def write_places_csv(zip_paths: List[Path], csv_path: Path, year: str) -> int:
    total = 0
    with csv_path.open("w", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "place_geoid",
                "name",
                "short_name",
                "state_code",
                "country_code",
                "center_latitude",
                "center_longitude",
                "bbox_ne_latitude",
                "bbox_ne_longitude",
                "bbox_sw_latitude",
                "bbox_sw_longitude",
                "geometry",
                "metadata",
            ],
        )
        writer.writeheader()
        for zip_path in zip_paths:
            with tempfile.TemporaryDirectory() as temp_extract_dir:
                shp_path = extract_shapefile(zip_path, Path(temp_extract_dir))
                reader = shapefile.Reader(str(shp_path))
                for shape_record in reader.iterShapeRecords():
                    record = shape_record.record.as_dict()
                    shape = shape_record.shape
                    min_lng, min_lat, max_lng, max_lat = shape.bbox
                    name = str(record.get("NAME") or "").strip()
                    writer.writerow(
                        {
                            "place_geoid": str(record.get("GEOID") or "").strip(),
                            "name": name,
                            "short_name": name,
                            "state_code": str(record.get("STATEFP") or "").strip(),
                            "country_code": "US",
                            "center_latitude": normalize_float(record.get("INTPTLAT")),
                            "center_longitude": normalize_float(record.get("INTPTLON")),
                            "bbox_ne_latitude": normalize_float(max_lat),
                            "bbox_ne_longitude": normalize_float(max_lng),
                            "bbox_sw_latitude": normalize_float(min_lat),
                            "bbox_sw_longitude": normalize_float(min_lng),
                            "geometry": json.dumps(shape.__geo_interface__),
                            "metadata": json.dumps(
                                {
                                    "source": "census_tiger",
                                    "dataset": "place",
                                    "year": year,
                                    "namelsad": record.get("NAMELSAD"),
                                    "lsad": record.get("LSAD"),
                                    "placefp": record.get("PLACEFP"),
                                    "classfp": record.get("CLASSFP"),
                                    "pcicbsa": record.get("PCICBSA"),
                                    "geoidfq": record.get("GEOIDFQ"),
                                }
                            ),
                        }
                    )
                    total += 1
    return total


def psql_sql(database_url: str, sql: str) -> None:
    run(["psql", database_url, "-v", "ON_ERROR_STOP=1", "-f", "-"], input_text=sql)


def run_psql_script(database_url: str, script_text: str) -> None:
    run(["psql", database_url, "-v", "ON_ERROR_STOP=1", "-f", "-"], input_text=script_text)


def import_cbsa(database_url: str, csv_path: Path) -> None:
    escaped = str(csv_path).replace("\\", "\\\\").replace("'", "''")
    run_psql_script(
        database_url,
        textwrap.dedent(
            f"""
        CREATE TEMP TABLE import_cbsa (
          cbsa_code text,
          name text,
          short_name text,
          cbsa_type text,
          country_code text,
          state_codes text,
          center_latitude text,
          center_longitude text,
          bbox_ne_latitude text,
          bbox_ne_longitude text,
          bbox_sw_latitude text,
          bbox_sw_longitude text,
          geometry text,
          metadata text
        );
        \\copy import_cbsa (cbsa_code, name, short_name, cbsa_type, country_code, state_codes, center_latitude, center_longitude, bbox_ne_latitude, bbox_ne_longitude, bbox_sw_latitude, bbox_sw_longitude, geometry, metadata) FROM '{escaped}' WITH (FORMAT csv, HEADER true);

        INSERT INTO geo_census_cbsa_boundaries (
          cbsa_code,
          name,
          short_name,
          cbsa_type,
          country_code,
          state_codes,
          center_latitude,
          center_longitude,
          bbox_ne_latitude,
          bbox_ne_longitude,
          bbox_sw_latitude,
          bbox_sw_longitude,
          geometry,
          metadata,
          updated_at
        )
        SELECT
          cbsa_code,
          name,
          NULLIF(short_name, ''),
          CASE cbsa_type
            WHEN 'metro' THEN 'metro'::census_cbsa_type
            ELSE 'micro'::census_cbsa_type
          END,
          COALESCE(NULLIF(country_code, ''), 'US'),
          ARRAY[]::varchar(8)[],
          NULLIF(center_latitude, '')::decimal(11,8),
          NULLIF(center_longitude, '')::decimal(11,8),
          NULLIF(bbox_ne_latitude, '')::decimal(11,8),
          NULLIF(bbox_ne_longitude, '')::decimal(11,8),
          NULLIF(bbox_sw_latitude, '')::decimal(11,8),
          NULLIF(bbox_sw_longitude, '')::decimal(11,8),
          CASE
            WHEN geometry = '' THEN NULL
            ELSE ST_Multi(
              ST_CollectionExtract(
                ST_MakeValid(
                  ST_SetSRID(ST_GeomFromGeoJSON(geometry), 4326)
                ),
                3
              )
            )
          END,
          CASE WHEN metadata = '' THEN '{{}}'::jsonb ELSE metadata::jsonb END,
          now()
        FROM import_cbsa
        ON CONFLICT (cbsa_code) DO UPDATE SET
          name = EXCLUDED.name,
          short_name = EXCLUDED.short_name,
          cbsa_type = EXCLUDED.cbsa_type,
          country_code = EXCLUDED.country_code,
          state_codes = EXCLUDED.state_codes,
          center_latitude = EXCLUDED.center_latitude,
          center_longitude = EXCLUDED.center_longitude,
          bbox_ne_latitude = EXCLUDED.bbox_ne_latitude,
          bbox_ne_longitude = EXCLUDED.bbox_ne_longitude,
          bbox_sw_latitude = EXCLUDED.bbox_sw_latitude,
          bbox_sw_longitude = EXCLUDED.bbox_sw_longitude,
          geometry = EXCLUDED.geometry,
          metadata = EXCLUDED.metadata,
          updated_at = now();

        INSERT INTO core_markets (
          market_key,
          market_name,
          market_short_name,
          market_type,
          country_code,
          census_cbsa_code,
          is_collectable,
          scheduler_enabled,
          is_active,
          center_latitude,
          center_longitude,
          bbox_ne_latitude,
          bbox_ne_longitude,
          bbox_sw_latitude,
          bbox_sw_longitude,
          geometry,
          metadata,
          updated_at
        )
        SELECT
          'us-cbsa-' || cbsa_code,
          name,
          NULLIF(short_name, ''),
          CASE cbsa_type
            WHEN 'metro' THEN 'cbsa_metro'::market_type
            ELSE 'cbsa_micro'::market_type
          END,
          country_code,
          cbsa_code,
          true,
          true,
          true,
          center_latitude,
          center_longitude,
          bbox_ne_latitude,
          bbox_ne_longitude,
          bbox_sw_latitude,
          bbox_sw_longitude,
          geometry,
          jsonb_build_object('source', 'census_cbsa', 'cbsaCode', cbsa_code),
          now()
        FROM geo_census_cbsa_boundaries
        ON CONFLICT (market_key) DO UPDATE SET
          market_name = EXCLUDED.market_name,
          market_short_name = EXCLUDED.market_short_name,
          market_type = EXCLUDED.market_type,
          country_code = EXCLUDED.country_code,
          census_cbsa_code = EXCLUDED.census_cbsa_code,
          is_collectable = EXCLUDED.is_collectable,
          scheduler_enabled = EXCLUDED.scheduler_enabled,
          is_active = EXCLUDED.is_active,
          center_latitude = EXCLUDED.center_latitude,
          center_longitude = EXCLUDED.center_longitude,
          bbox_ne_latitude = EXCLUDED.bbox_ne_latitude,
          bbox_ne_longitude = EXCLUDED.bbox_ne_longitude,
          bbox_sw_latitude = EXCLUDED.bbox_sw_latitude,
          bbox_sw_longitude = EXCLUDED.bbox_sw_longitude,
          geometry = EXCLUDED.geometry,
          metadata = EXCLUDED.metadata,
          updated_at = now();

        DROP TABLE import_cbsa;
        """
        ),
    )


def import_places(database_url: str, csv_path: Path) -> None:
    escaped = str(csv_path).replace("\\", "\\\\").replace("'", "''")
    run_psql_script(
        database_url,
        textwrap.dedent(
            f"""
        CREATE TEMP TABLE import_places (
          place_geoid text,
          name text,
          short_name text,
          state_code text,
          country_code text,
          center_latitude text,
          center_longitude text,
          bbox_ne_latitude text,
          bbox_ne_longitude text,
          bbox_sw_latitude text,
          bbox_sw_longitude text,
          geometry text,
          metadata text
        );
        \\copy import_places (place_geoid, name, short_name, state_code, country_code, center_latitude, center_longitude, bbox_ne_latitude, bbox_ne_longitude, bbox_sw_latitude, bbox_sw_longitude, geometry, metadata) FROM '{escaped}' WITH (FORMAT csv, HEADER true);

        INSERT INTO geo_census_place_boundaries (
          place_geoid,
          name,
          short_name,
          state_code,
          country_code,
          center_latitude,
          center_longitude,
          bbox_ne_latitude,
          bbox_ne_longitude,
          bbox_sw_latitude,
          bbox_sw_longitude,
          geometry,
          metadata,
          updated_at
        )
        SELECT
          place_geoid,
          name,
          NULLIF(short_name, ''),
          state_code,
          COALESCE(NULLIF(country_code, ''), 'US'),
          NULLIF(center_latitude, '')::decimal(11,8),
          NULLIF(center_longitude, '')::decimal(11,8),
          NULLIF(bbox_ne_latitude, '')::decimal(11,8),
          NULLIF(bbox_ne_longitude, '')::decimal(11,8),
          NULLIF(bbox_sw_latitude, '')::decimal(11,8),
          NULLIF(bbox_sw_longitude, '')::decimal(11,8),
          CASE
            WHEN geometry = '' THEN NULL
            ELSE ST_Multi(
              ST_CollectionExtract(
                ST_MakeValid(
                  ST_SetSRID(ST_GeomFromGeoJSON(geometry), 4326)
                ),
                3
              )
            )
          END,
          CASE WHEN metadata = '' THEN '{{}}'::jsonb ELSE metadata::jsonb END,
          now()
        FROM import_places
        ON CONFLICT (place_geoid) DO UPDATE SET
          name = EXCLUDED.name,
          short_name = EXCLUDED.short_name,
          state_code = EXCLUDED.state_code,
          country_code = EXCLUDED.country_code,
          center_latitude = EXCLUDED.center_latitude,
          center_longitude = EXCLUDED.center_longitude,
          bbox_ne_latitude = EXCLUDED.bbox_ne_latitude,
          bbox_ne_longitude = EXCLUDED.bbox_ne_longitude,
          bbox_sw_latitude = EXCLUDED.bbox_sw_latitude,
          bbox_sw_longitude = EXCLUDED.bbox_sw_longitude,
          geometry = EXCLUDED.geometry,
          metadata = EXCLUDED.metadata,
          updated_at = now();

        DROP TABLE import_places;
        """
        ),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Census CBSA and Place boundaries into the local market tables.")
    parser.add_argument("--year", default=DEFAULT_YEAR)
    parser.add_argument(
        "--states",
        default="all",
        help="Comma-separated FIPS state codes for place imports, or 'all'.",
    )
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    load_env_file(script_dir.parent / ".env")
    load_env_file(script_dir.parent.parent / ".env")

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")

    year = args.year.strip()
    state_codes = (
        ALL_STATE_CODES
        if args.states.strip().lower() == "all"
        else [code.strip() for code in args.states.split(",") if code.strip()]
    )

    with tempfile.TemporaryDirectory(prefix="census-markets-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)

        cbsa_zip = temp_dir / f"tl_{year}_us_cbsa.zip"
        print(f"Downloading CBSA shapefile for {year}...")
        download_zip(
            f"{TIGER_BASE_URL}/TIGER{year}/CBSA/tl_{year}_us_cbsa.zip",
            cbsa_zip,
        )
        cbsa_extract = temp_dir / "cbsa"
        cbsa_extract.mkdir()
        cbsa_shp = extract_shapefile(cbsa_zip, cbsa_extract)
        cbsa_csv = temp_dir / "cbsa.csv"
        cbsa_count = write_cbsa_csv(cbsa_shp, cbsa_csv, year)
        print(f"Prepared {cbsa_count} CBSA rows")
        import_cbsa(database_url, cbsa_csv)

        place_zip_paths: List[Path] = []
        for state_code in state_codes:
            place_zip = temp_dir / f"tl_{year}_{state_code}_place.zip"
            print(f"Downloading Place shapefile for state {state_code}...")
            download_zip(
                f"{TIGER_BASE_URL}/TIGER{year}/PLACE/tl_{year}_{state_code}_place.zip",
                place_zip,
            )
            place_zip_paths.append(place_zip)

        places_csv = temp_dir / "places.csv"
        place_count = write_places_csv(place_zip_paths, places_csv, year)
        print(f"Prepared {place_count} place rows")
        import_places(database_url, places_csv)

    print("Census market import completed.")


if __name__ == "__main__":
    main()

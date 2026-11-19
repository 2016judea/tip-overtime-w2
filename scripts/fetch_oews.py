#!/usr/bin/env python3
"""Pull May 2025 OEWS national wages for every SOC code the IRS ties to a Treasury Tipped Occupation Code.

Source: BLS Occupational Employment and Wage Statistics, national, all industries, via the BLS public
API v2 (series OEUN0000000000000<SOC><datatype>). Datatypes: 01 employment, 04 annual mean wage,
11-15 annual wage at the 10th, 25th, 50th, 75th and 90th percentiles. OEWS wages include tips
(BLS OEWS technical notes). Writes data/oews_tipped.json. Needs BLS_API_KEY (bricks/.env); curl does
the HTTP because python urllib fails TLS on this machine.
"""
import json, os, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TYPES = {"01": "employment", "04": "annual_mean", "11": "p10", "12": "p25", "13": "median", "14": "p75", "15": "p90"}


def key():
    k = os.environ.get("BLS_API_KEY")
    if k: return k
    for line in (Path.home() / "Desktop/workspace/bricks/.env").read_text().splitlines():
        if line.startswith("BLS_API_KEY="): return line.split("=", 1)[1].strip().strip('"')
    sys.exit("BLS_API_KEY not set")


def main():
    table = json.loads((ROOT / "data/ttoc_irs_table.json").read_text())
    socs = sorted({s for row in table for s in row["soc"]})
    ids = [f"OEUN0000000000000{s.replace('-', '')}{t}" for s in socs for t in TYPES]
    out, year = {s: {} for s in socs}, None
    k = key()
    for i in range(0, len(ids), 50):
        body = json.dumps({"seriesid": ids[i:i + 50], "registrationkey": k, "latest": True})
        raw = subprocess.run(["curl", "-sS", "-X", "POST", "https://api.bls.gov/publicAPI/v2/timeseries/data/",
                              "-H", "Content-Type: application/json", "-d", body], capture_output=True, text=True, check=True).stdout
        d = json.loads(raw)
        if d.get("status") != "REQUEST_SUCCEEDED": sys.exit(f"BLS: {d.get('status')} {d.get('message')}")
        for s in d["Results"]["series"]:
            sid = s["seriesID"]; soc = sid[17:19] + "-" + sid[19:23]; t = sid[23:25]
            v = s["data"][0]["value"] if s["data"] else None
            if s["data"]: year = s["data"][0]["year"]
            out[soc][TYPES[t]] = int(float(v)) if v not in (None, "-", "*", "#") and v.replace(".", "").isdigit() else None
        print(f"  {min(i + 50, len(ids))}/{len(ids)} series", file=sys.stderr)
    res = {"source": "BLS OEWS, national, all industries", "reference": f"May {year}", "api": "https://api.bls.gov/publicAPI/v2/timeseries/data/",
           "series_pattern": "OEUN0000000000000<SOC><01 employment|04 mean|11-15 p10,p25,median,p75,p90>", "soc": out}
    (ROOT / "data/oews_tipped.json").write_text(json.dumps(res, indent=1) + "\n")
    print(f"{len(socs)} SOC codes, reference May {year}")


if __name__ == "__main__":
    main()

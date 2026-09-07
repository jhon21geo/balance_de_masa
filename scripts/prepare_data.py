#!/usr/bin/env python3
"""Parse Resultado_Balance_Mineral.csv, reconstruct Fabris et al. (2013) classes,
and emit compact JSON for the public comparison viewer."""

from __future__ import annotations

import csv
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "Resultado_Balance_Mineral.csv"
OUT_DIR = ROOT / "docs" / "data"

# Rudnick & Gao (2003) crustal abundances used in Report Book 2013/00014 Table 4
# thresholds are 10x crust.
TABLE4 = {
    "au_ppm": 0.013,  # Au>0.013 ppm  (CSV is ppb)
    "ag": 0.56,
    "as": 25.0,
    "ba": 4560.0,
    "bi": 1.8,
    "ce": 430.0,
    "cu": 270.0,
    "la": 200.0,
    "sb": 2.0,
    "se": 1.3,
    "te": 1.0,
    "mo": 8.0,
    "w": 10.0,
}

# Map hole prefixes / names to the prospects cited in the report
PROSPECT = {
    "CAR01": "Carrapateena",
    "CAR02": "Carrapateena",
    "SAE3": "Emmie Bluff",
    "SAE4": "Emmie Bluff",
    "SAE6": "Emmie Bluff",
    "SAE7": "Emmie Bluff",
    "SAE8": "Emmie Bluff",
    "SAE9": "Emmie Bluff",
    "SAE10": "Emmie Bluff",
    "SAE11": "Emmie Bluff",
    "IHAD1": "Emmie Bluff",
    "IHAD2": "Emmie Bluff",
    "IHAD3": "Emmie Bluff",
    "IHAD5": "Emmie Bluff",
    "IHAD6": "Emmie Bluff",
    "IHAD8": "Emmie Bluff",
    "MGD_35": "Mt Woods",
    "MGD_44": "Mt Woods",
    "CHRCD001": "Mt Woods",
    "PY4": "Punt Hill",
    "WHD_1": "Punt Hill",
    "WPDD2": "Punt Hill",
    "WWDD1": "Punt Hill",
    "WJD1": "Punt Hill",
    "WC05D001": "Punt Hill",
    "HWD1": "Punt Hill",
    "DRD1": "Arcoona / regional",
    "HHD1_HHD1W1_1": "Arcoona / regional",
    "PSC_4_SASC_2": "Khamsin / regional",
    "PSC_7_SASC_3": "Regional",
    "EC_21": "Regional",
    "HL002": "Regional",
    "CSD1": "Regional",
    "TD_1": "Regional",
    "MDD004": "Regional",
    "PINDARI_1": "Regional",
    "VANGUARD_1": "Regional",
    "GHDD6": "Regional",
    "FH_AFMECO_TO_MW23_5": "Regional",
    "AD2": "Wallaroo Group",
    "AD8": "Wallaroo Group",
    "ASD1": "Donington Suite",
    "ASD2": "Hutchinson Group",
}


def num(x):
    if x is None:
        return None
    s = str(x).strip()
    if s == "" or s.lower() in {"nan", "na", "n/a", "null", "none"}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def mean(vals):
    vals = [v for v in vals if v is not None]
    return sum(vals) / len(vals) if vals else None


def pearson(xs, ys):
    pairs = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    n = len(pairs)
    if n < 3:
        return None
    mx = sum(p[0] for p in pairs) / n
    my = sum(p[1] for p in pairs) / n
    nume = sum((p[0] - mx) * (p[1] - my) for p in pairs)
    dx = math.sqrt(sum((p[0] - mx) ** 2 for p in pairs))
    dy = math.sqrt(sum((p[1] - my) ** 2 for p in pairs))
    if dx == 0 or dy == 0:
        return None
    return nume / (dx * dy)


def parse_csv(path: Path):
    with path.open(newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = []
        i_json = header.index("ALT_ZSCORES")
        for raw in reader:
            if len(raw) == 194:
                js = ",".join(raw[i_json : i_json + 4])
                raw = raw[:i_json] + [js] + raw[i_json + 4 :]
            if len(raw) != 191:
                continue
            rows.append(dict(zip(header, raw)))
    return rows


def molar_k_al(k, al):
    if k is None or al is None or al <= 0:
        return None
    return (k / 39.098) / (al / 26.982)


def molar_na_al(na, al):
    if na is None or al is None or al <= 0:
        return None
    return (na / 22.990) / (al / 26.982)


def ger_class(k_al, na_al):
    """Reproduce the Feldspar Na-K GER fields described in Fabris et al. 2013 §4.2.1."""
    if k_al is None or na_al is None:
        return "Sin datos"
    if k_al >= 0.70:
        return "K-feldespato"
    if na_al >= 0.55 and k_al < 0.45:
        return "Albita"
    if k_al >= 0.18:
        return "Sericita"
    if na_al >= 0.25:
        return "Intermedio / fondo"
    return "Clorita"


def spectral_family(grp, mineral):
    g = (grp or "").strip()
    m = (mineral or "").strip().lower()
    if g == "White Micas" or "muscov" in m or "pheng" in m or "illite" in m:
        return "Mica blanca / sericita"
    if g == "Chlorites" or "chlorite" in m:
        return "Clorita"
    if g == "Carbonates" or m in {"siderite", "ankerite", "calcite", "dolomite"}:
        return "Carbonato"
    if g == "Amphiboles" or "hornblende" in m:
        return "Anfibol / calc-silicato"
    if g in {"Epidotes", "Other MgOH"} or "epidote" in m or "talc" in m:
        return "Calc-silicato"
    if g in {"Kaolins", "Sulphates"}:
        return "Arcilla / sulfato"
    if not g:
        return "Sin mineral SWIR"
    return g


def mb_family(row):
    """Dominant mass-balance family excluding quartz (always abundant)."""
    buckets = {
        "Mica blanca / sericita": (num(row["M_Muscovita"]) or 0)
        + (num(row["M_Illita"]) or 0)
        + (num(row["M_Pirofilita"]) or 0)
        + (num(row["M_Dickita"]) or 0),
        "Clorita": (num(row["M_Clorita"]) or 0) + (num(row["M_Smectita"]) or 0),
        "K-feldespato": num(row["M_Feldespato_K"]) or 0,
        "Fe-óxido": (num(row["M_Magnetita"]) or 0) + (num(row["M_Hematita"]) or 0),
        "Carbonato": (num(row["M_Calcita"]) or 0)
        + (num(row["M_Ankerita"]) or 0)
        + (num(row["M_Rodocrosita"]) or 0),
        "Calc-silicato": (num(row["M_Piroxeno"]) or 0)
        + (num(row["M_Epidota"]) or 0)
        + (num(row["M_Granate"]) or 0),
        "Caolinita / arcilla": (num(row["M_Kaolinita"]) or 0) + (num(row["M_Alunita"]) or 0),
        "Sulfuro Cu": (num(row["M_Calcopirita"]) or 0)
        + (num(row["M_Bornita"]) or 0)
        + (num(row["M_Calcosina"]) or 0)
        + (num(row["M_Covelita"]) or 0),
    }
    fam, val = max(buckets.items(), key=lambda kv: kv[1])
    if val < 3:
        return "Mixto / cuarzo", val, buckets
    return fam, val, buckets


def report_assemblage(ger, spec, fe, magsus):
    """Approximate the combined spectral+geochem+petrophysics labels of §4.2.3–4.2.4."""
    fe_rich = (fe or 0) >= 10
    mt = (magsus or 0) >= 5000
    spec = spec or "Sin mineral SWIR"

    if ger == "K-feldespato":
        base = "K-feldespato"
        if spec == "Mica blanca / sericita":
            base = "K-feldespato-sericita"
        if fe_rich:
            base = base + "-Fe-óxido"
        if mt:
            base = base.replace("-Fe-óxido", "") + "-magnetita"
        return base

    if spec == "Mica blanca / sericita" or ger == "Sericita":
        base = "Sericita"
        if spec == "Clorita" or ger == "Clorita":
            base = "Sericita-clorita"
        if fe_rich:
            base = "Sericita-Fe-óxido" if "clorita" not in base.lower() else "Sericita-clorita-Fe-óxido"
        if mt:
            base = "Sericita-magnetita"
        return base

    if spec == "Clorita" or ger == "Clorita":
        base = "Clorita"
        if fe_rich:
            base = "Clorita-Fe-óxido"
        if mt:
            base = "Clorita-magnetita"
        if spec == "Anfibol / calc-silicato":
            base = "Clorita-anfibol-Fe-óxido" if fe_rich else "Clorita-anfibol"
        return base

    if spec == "Anfibol / calc-silicato":
        return "Anfibol"
    if spec == "Carbonato":
        return "Carbonato" + ("-Fe-óxido" if fe_rich else "")
    if fe_rich and mt:
        return "Magnetita"
    if fe_rich:
        return "Fe-óxido"
    if ger == "Albita":
        return "Albita / fondo"
    if ger == "Intermedio / fondo":
        return "Alteración regional / fondo"
    return "Indeterminado"


def table4_hits(row):
    au_ppb = num(row["Au_ppb"])
    au_ppm = None if au_ppb is None else au_ppb / 1000.0
    checks = {
        "Au": au_ppm is not None and au_ppm > TABLE4["au_ppm"],
        "Ag": (num(row["Ag_ppm"]) or 0) > TABLE4["ag"],
        "As": (num(row["As_ppm"]) or 0) > TABLE4["as"],
        "Ba": (num(row["Ba_ppm"]) or 0) > TABLE4["ba"],
        "Bi": (num(row["Bi_ppm"]) or 0) > TABLE4["bi"],
        "Ce": (num(row["Ce_ppm"]) or 0) > TABLE4["ce"],
        "Cu": (num(row["Cu_ppm"]) or 0) > TABLE4["cu"],
        "La": (num(row["La_ppm"]) or 0) > TABLE4["la"],
        "Sb": (num(row["Sb_ppm"]) or 0) > TABLE4["sb"],
        "Se": (num(row["Se_ppm"]) or 0) > TABLE4["se"],
        "Te": (num(row["Te_ppm"]) or 0) > TABLE4["te"],
        "Mo": (num(row["Mo_ppm"]) or 0) > TABLE4["mo"],
        "W": (num(row["W_ppm"]) or 0) > TABLE4["w"],
        "w2200": (lambda w: w is not None and 2206 <= w <= 2221)(num(row["w2200"])),
        "w2250": (lambda w: w is not None and w > 2246)(num(row["w2250"])),
    }
    geo_keys = ["Au", "Ag", "As", "Ba", "Bi", "Ce", "Cu", "La", "Sb", "Se", "Te", "Mo", "W"]
    return checks, sum(1 for k in geo_keys if checks[k])


def round_or_none(v, n=3):
    if v is None:
        return None
    try:
        if math.isnan(v) or math.isinf(v):
            return None
    except TypeError:
        return v
    return round(float(v), n)


def main():
    rows = parse_csv(CSV_PATH)
    samples = []
    confusion = defaultdict(Counter)
    ger_vs_chem = defaultdict(Counter)
    spec_vs_mb = defaultdict(Counter)
    report_vs_mb = defaultdict(Counter)
    valid_by_spec = defaultdict(Counter)

    for r in rows:
        k = num(r["K_pct"])
        na = num(r["Na_pct"])
        al = num(r["Al_pct"])
        fe = num(r["Fe_pct"])
        magsus = num(r["MagSus_MSUS"])
        k_al = molar_k_al(k, al)
        na_al = molar_na_al(na, al)
        ger = ger_class(k_al, na_al)
        spec = spectral_family(r["Grp1_sTSAS"], r["Min1_sTSAS"])
        mb, mb_val, buckets = mb_family(r)
        asm = report_assemblage(ger, spec, fe, magsus)
        t4, t4n = table4_hits(r)
        chem = r["ALTERACION_QUIMICA"] or "Indefinida"
        valid = r["VALIDACION_MINERALOGICA"] or "N/A"

        confusion[spec][mb] += 1
        ger_vs_chem[ger][chem] += 1
        spec_vs_mb[spec][mb] += 1
        report_vs_mb[asm][mb] += 1
        valid_by_spec[spec][valid] += 1

        agree_mica = spec == "Mica blanca / sericita" and mb == "Mica blanca / sericita"
        agree_chl = spec == "Clorita" and mb == "Clorita"
        agree = agree_mica or agree_chl or (
            spec == "Carbonato" and mb == "Carbonato"
        ) or (
            spec == "Anfibol / calc-silicato" and mb == "Calc-silicato"
        )

        samples.append(
            {
                "h": r["holeid"],
                "p": PROSPECT.get(r["holeid"], "Regional"),
                "f": round_or_none(num(r["from"]), 2),
                "t": round_or_none(num(r["to"]), 2),
                "lat": round_or_none(num(r["Lat"]), 5),
                "lon": round_or_none(num(r["Long"]), 5),
                "e": round_or_none(num(r["Easting"]), 0),
                "n": round_or_none(num(r["Northing"]), 0),
                "z": round_or_none(num(r["mid_z"]), 1),
                "lith": r["Lithology"] or "",
                "st": r["Stratigraphy"] or "",
                "fe": round_or_none(fe, 2),
                "al": round_or_none(al, 2),
                "cu": round_or_none(num(r["Cu_ppm"]), 1),
                "au": round_or_none(num(r["Au_ppb"]), 1),
                "ag": round_or_none(num(r["Ag_ppm"]), 2),
                "s": round_or_none(num(r["S_pct"]) if num(r["S_pct"]) is not None else (num(r["S_ppm"]) or 0) / 10000.0, 3),
                "ms": round_or_none(magsus, 1),
                "den": round_or_none(num(r["Density_SI"]), 2),
                "w22": round_or_none(num(r["w2200"]), 1),
                "w25": round_or_none(num(r["w2250"]), 1),
                "grp": r["Grp1_sTSAS"] or "",
                "min": r["Min1_sTSAS"] or "",
                "spec": spec,
                "ger": ger,
                "asm": asm,
                "mb": mb,
                "chem": chem,
                "val": valid,
                "conf": r["CONFIANZA_NIVEL"] or "",
                "ct": round_or_none(num(r["CONFIANZA_TOTAL"]), 3),
                "nrmse": round_or_none(num(r["VAL_NRMSE"]), 4),
                "kal": round_or_none(k_al, 3),
                "naal": round_or_none(na_al, 3),
                "mt": round_or_none(num(r["M_Magnetita"]), 2),
                "hm": round_or_none(num(r["M_Hematita"]), 2),
                "msv": round_or_none(num(r["M_Muscovita"]), 2),
                "ill": round_or_none(num(r["M_Illita"]), 2),
                "chl": round_or_none(num(r["M_Clorita"]), 2),
                "kf": round_or_none(num(r["M_Feldespato_K"]), 2),
                "qtz": round_or_none(num(r["M_Cuarzo"]), 2),
                "carb": round_or_none(buckets["Carbonato"], 2),
                "csil": round_or_none(buckets["Calc-silicato"], 2),
                "sul": round_or_none(buckets["Sulfuro Cu"], 2),
                "mica": round_or_none(buckets["Mica blanca / sericita"], 2),
                "t4": t4n,
                "t4s": int(t4["w2200"]),
                "t4c": int(t4["w2250"]),
                "agree": int(agree),
            }
        )

    n = len(samples)
    holes = defaultdict(list)
    for s in samples:
        holes[s["h"]].append(s)

    hole_sum = []
    for hid, ss in sorted(holes.items()):
        hole_sum.append(
            {
                "id": hid,
                "prospect": ss[0]["p"],
                "n": len(ss),
                "lat": mean([s["lat"] for s in ss]),
                "lon": mean([s["lon"] for s in ss]),
                "cu": round(mean([s["cu"] for s in ss]) or 0, 1),
                "fe": round(mean([s["fe"] for s in ss]) or 0, 2),
                "t4": round(mean([s["t4"] for s in ss]) or 0, 2),
                "conc": sum(1 for s in ss if s["val"] == "Concordante"),
                "disc": sum(1 for s in ss if s["val"] == "Discordante"),
                "mt": round(mean([s["mt"] for s in ss]) or 0, 2),
            }
        )

    def cnt(key):
        return Counter(s[key] for s in samples)

    classified = [s for s in samples if s["val"] in {"Concordante", "Discordante"}]
    n_class = len(classified)
    n_conc = sum(1 for s in classified if s["val"] == "Concordante")

    # Spectral vs MB agreement among samples that have a SWIR mineral
    comparable = [
        s
        for s in samples
        if s["spec"]
        in {
            "Mica blanca / sericita",
            "Clorita",
            "Carbonato",
            "Anfibol / calc-silicato",
            "Calc-silicato",
        }
    ]
    n_agree = sum(s["agree"] for s in comparable)

    fe_ox = [s for s in samples if (s["fe"] or 0) >= 10]
    mt_ms = [s for s in samples if (s["ms"] or 0) >= 5000]
    mt_mb = [s for s in samples if (s["mt"] or 0) >= 5]
    hem_mb = [s for s in samples if (s["hm"] or 0) >= 5]
    high_cu = [s for s in samples if (s["cu"] or 0) > 270]
    w22_ok = [s for s in high_cu if s["w22"] is not None and 2206 <= s["w22"] <= 2221]
    w25_ok = [s for s in high_cu if s["w25"] is not None and s["w25"] > 2246]
    high_cu_with_w22 = [s for s in high_cu if s["w22"] is not None]
    high_cu_with_w25 = [s for s in high_cu if s["w25"] is not None]

    r_ms_mt = pearson([s["ms"] for s in samples], [s["mt"] for s in samples])
    r_fe_ox = pearson(
        [s["fe"] for s in samples],
        [(s["mt"] or 0) + (s["hm"] or 0) for s in samples],
    )
    r_cu_t4 = pearson([s["cu"] for s in samples], [s["t4"] for s in samples])
    r_mica = pearson(
        [s["mica"] for s in samples if s["spec"] == "Mica blanca / sericita"],
        [s["kal"] for s in samples if s["spec"] == "Mica blanca / sericita"],
    )

    albite_zero = sum(1 for s in samples if (s.get("naal") or 0) < 0.15)
    # M_Albita / plagioclase are all ~0 — confirm from original rows
    alb_mb = sum(1 for r in rows if (num(r["M_Albita"]) or 0) > 1)
    plag_mb = sum(1 for r in rows if (num(r["M_Plagioclasa"]) or 0) > 1)

    summary = {
        "n_samples": n,
        "n_holes": len(holes),
        "n_prospects": len({s["p"] for s in samples}),
        "counts": {
            "spectral": cnt("spec"),
            "ger": cnt("ger"),
            "report_assemblage": cnt("asm"),
            "mass_balance": cnt("mb"),
            "chem_alteration": cnt("chem"),
            "validation": cnt("val"),
            "confianza": cnt("conf"),
            "stratigraphy": Counter((s["st"] or "s/d") for s in samples),
            "prospect": cnt("p"),
        },
        "matrices": {
            "spectral_vs_mb": {k: dict(v) for k, v in spec_vs_mb.items()},
            "ger_vs_chem": {k: dict(v) for k, v in ger_vs_chem.items()},
            "report_vs_mb": {k: dict(v) for k, v in report_vs_mb.items()},
        },
        "metrics": {
            "pct_fe_gt10": round(100 * len(fe_ox) / n, 1),
            "pct_cu_gt270": round(100 * len(high_cu) / n, 1),
            "pct_na_depleted": round(100 * albite_zero / n, 1),
            "n_magsus_mt": len(mt_ms),
            "n_mb_magnetite_gt5": len(mt_mb),
            "n_mb_hematite_gt5": len(hem_mb),
            "pct_hematite_among_feox_mb": round(
                100 * len(hem_mb) / max(1, len(hem_mb) + len(mt_mb) - len([s for s in samples if (s["mt"] or 0) >= 5 and (s["hm"] or 0) >= 5])),
                1,
            ),
            "mean_magnetite": round(mean([s["mt"] for s in samples]) or 0, 2),
            "mean_hematite": round(mean([s["hm"] for s in samples]) or 0, 2),
            "mean_kfeldspar": round(mean([s["kf"] for s in samples]) or 0, 2),
            "mean_chlorite": round(mean([s["chl"] for s in samples]) or 0, 2),
            "mean_mica": round(mean([s["mica"] for s in samples]) or 0, 2),
            "mean_quartz": round(mean([s["qtz"] for s in samples]) or 0, 2),
            "n_albite_mb_gt1": alb_mb,
            "n_plagioclase_mb_gt1": plag_mb,
            "validation_n": n_class,
            "validation_concordant": n_conc,
            "validation_concordant_pct": round(100 * n_conc / n_class, 1) if n_class else 0,
            "spectral_mb_agree_n": n_agree,
            "spectral_mb_comparable_n": len(comparable),
            "spectral_mb_agree_pct": round(100 * n_agree / len(comparable), 1) if comparable else 0,
            "high_cu_w2200_in_window_pct": round(
                100 * len(w22_ok) / len(high_cu_with_w22), 1
            )
            if high_cu_with_w22
            else None,
            "high_cu_w2250_long_pct": round(
                100 * len(w25_ok) / len(high_cu_with_w25), 1
            )
            if high_cu_with_w25
            else None,
            "r_magsus_magnetite": round(r_ms_mt, 3) if r_ms_mt is not None else None,
            "r_fe_feoxides": round(r_fe_ox, 3) if r_fe_ox is not None else None,
            "r_cu_table4": round(r_cu_t4, 3) if r_cu_t4 is not None else None,
            "mean_table4": round(mean([s["t4"] for s in samples]) or 0, 2),
            "indefinida_pct": round(100 * cnt("chem")["Indefinida"] / n, 1),
            "phengite_n": sum(1 for r in rows if (r["Min1_sTSAS"] or "").startswith("Pheng")),
            "fe_chlorite_n": sum(1 for r in rows if r["Min1_sTSAS"] in {"FeChlorite", "FeMgChlorite"}),
            "muscovite_n": sum(1 for r in rows if (r["Min1_sTSAS"] or "").startswith("Muscov")),
        },
        "holes": [
            {
                **h,
                "lat": round(h["lat"], 5) if h["lat"] else None,
                "lon": round(h["lon"], 5) if h["lon"] else None,
            }
            for h in hole_sum
        ],
    }

    # JSON-friendly counters
    def conv(obj):
        if isinstance(obj, Counter):
            return dict(obj)
        if isinstance(obj, dict):
            return {k: conv(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [conv(v) for v in obj]
        return obj

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "samples.json").write_text(
        json.dumps(samples, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    (OUT_DIR / "summary.json").write_text(
        json.dumps(conv(summary), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("samples", n, "bytes", (OUT_DIR / "samples.json").stat().st_size)
    print("holes", len(holes))
    print("metrics", json.dumps(summary["metrics"], indent=2))
    print("spectral", summary["counts"]["spectral"])
    print("ger", summary["counts"]["ger"])
    print("mb", summary["counts"]["mass_balance"])
    print("chem", summary["counts"]["chem_alteration"])
    print("asm top", Counter(s["asm"] for s in samples).most_common(12))


if __name__ == "__main__":
    main()

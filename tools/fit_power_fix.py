#!/usr/bin/env python3
"""
fit_power_fix.py – korrigiert die Leistungswerte in einer Garmin-FIT-Datei (z. B. Indoor-Cycling
am Life Fitness IC5) und lässt alles andere unverändert (Puls, Trittfrequenz, Zeit, Geräteinfos).

    P_neu = a · P_alt + b        (Standard: b = 0, also reiner Faktor)

Korrigiert werden:
  record  (20): power, accumulated_power
  lap     (19): avg_power, max_power, normalized_power, total_work
  session (18): avg_power, max_power, normalized_power, total_work,
                intensity_factor (×k), training_stress_score (×k²)   mit k = NP_neu / NP_alt

Benutzung (Windows, nur Python nötig, keine Zusatzpakete):
    python fit_power_fix.py aktivitaet.fit --scale 1.5
    python fit_power_fix.py *.fit --scale 1.5 --offset 0       # mehrere Dateien
-> schreibt  aktivitaet_korr.fit  daneben. Danach in Garmin Connect:
   Original-Aktivität löschen, korrigierte Datei über "Daten importieren" hochladen.
"""
import argparse, glob, struct, sys

BASE = {0x00: 1, 0x01: 1, 0x02: 1, 0x83: 2, 0x84: 2, 0x85: 4, 0x86: 4, 0x07: 1, 0x88: 4,
        0x89: 8, 0x0A: 1, 0x8B: 2, 0x8C: 4, 0x0D: 1, 0x8E: 8, 0x8F: 8, 0x90: 8}

# (globale Nachricht, Feld) -> Art der Korrektur
TARGETS = {
    (20, 7): "power", (20, 29): "work",
    (19, 19): "power", (19, 20): "power", (19, 33): "power", (19, 41): "work",
    (18, 20): "power", (18, 21): "power", (18, 34): "power", (18, 48): "work",
    (18, 36): "if", (18, 35): "tss",
}

CRC_TABLE = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
             0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400]

def fit_crc(data, crc=0):
    for b in data:
        t = CRC_TABLE[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc ^= t ^ CRC_TABLE[b & 0xF]
        t = CRC_TABLE[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc ^= t ^ CRC_TABLE[(b >> 4) & 0xF]
    return crc

def walk(d):
    """Liefert (globale Nachricht, Feldnummer, Offset, Größe, Basistyp, Endianness) aller Datenfelder."""
    hs = d[0]; end = hs + struct.unpack_from("<I", d, 4)[0]
    i, defs = hs, {}
    while i < end:
        h = d[i]; i += 1
        if h & 0x80:
            lt = (h >> 5) & 3
        elif h & 0x40:
            lt = h & 0x0F; arch = d[i + 1]; e = ">" if arch else "<"
            g = struct.unpack_from(e + "H", d, i + 2)[0]; nf = d[i + 4]; i += 5
            fields = [(d[i + 3*k], d[i + 3*k + 1], d[i + 3*k + 2]) for k in range(nf)]; i += 3*nf
            dev = 0
            if h & 0x20:
                nd = d[i]; i += 1; dev = sum(d[i + 3*k + 1] for k in range(nd)); i += 3*nd
            defs[lt] = (g, e, fields, dev)
            continue
        else:
            lt = h & 0x0F
        g, e, fields, dev = defs[lt]
        for f, size, bt in fields:
            yield g, f, i, size, bt, e
            i += size
        i += dev
    return

FMT = {(2, False): "H", (4, False): "I"}
INVALID = {"H": 0xFFFF, "I": 0xFFFFFFFF}

def fix(path, a, b, out):
    d = bytearray(open(path, "rb").read())
    if d[8:12] != b".FIT":
        raise ValueError("keine FIT-Datei")
    hs = d[0]; dsize = struct.unpack_from("<I", d, 4)[0]

    # 1. Durchlauf: Session-NP alt/neu bestimmen (für IF/TSS) -> k
    np_old = np_new = None
    entries = list(walk(d))
    for g, f, off, size, bt, e in entries:
        if (g, f) == (18, 34) and size == 2:
            v = struct.unpack_from(e + "H", d, off)[0]
            if v != 0xFFFF:
                np_old, np_new = v, max(0, round(a * v + b))
    k = (np_new / np_old) if np_old else a

    n_rec = 0
    for g, f, off, size, bt, e in entries:
        kind = TARGETS.get((g, f))
        if not kind or size not in (2, 4):
            continue
        fmt = FMT[(size, False)]
        v = struct.unpack_from(e + fmt, d, off)[0]
        if v == INVALID[fmt]:
            continue
        if kind == "power":
            nv = 0 if v == 0 else max(0, round(a * v + b))   # 0 W (Leerlauf) bleibt 0
            n_rec += g == 20
        elif kind == "work":
            nv = round(a * v)                                 # Offset bei Arbeit nicht sauber definierbar
        elif kind == "if":
            nv = round(v * k)
        else:  # tss
            nv = round(v * k * k)
        struct.pack_into(e + fmt, d, off, min(nv, INVALID[fmt] - 1))

    # Datei-CRC neu
    struct.pack_into("<H", d, hs + dsize, fit_crc(d[:hs + dsize]))
    open(out, "wb").write(d)
    return n_rec, np_old, np_new

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+")
    ap.add_argument("--scale", type=float, required=True, help="Faktor a")
    ap.add_argument("--offset", type=float, default=0.0, help="Offset b in W (Standard 0)")
    a = ap.parse_args()
    paths = [p for pat in a.files for p in (glob.glob(pat) or [pat])]
    for p in paths:
        out = p[:-4] + "_korr.fit" if p.lower().endswith(".fit") else p + "_korr.fit"
        try:
            n, o, nn = fix(p, a.scale, a.offset, out)
            print(f"{p}: {n} Leistungswerte korrigiert, NP {o} -> {nn} W  =>  {out}")
        except Exception as ex:
            print(f"{p}: FEHLER {ex}", file=sys.stderr)

if __name__ == "__main__":
    main()

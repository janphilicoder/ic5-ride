"""Prüft tests/out/test.fit mit einem unabhängigen FIT-Decoder (tests/fitdec.py)."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import fitdec
f = os.path.join(os.path.dirname(__file__), "out", "test.fit")
r = fitdec.records(f); s = fitdec.sessions(f)[0]
checks = [(len(r) == 1800, "1800 Datenpunkte"), (s.get(5) == 2 and s.get(6) == 6, "Sport Radfahren / Indoor"),
          (s.get(20) == 201, f"Ø Leistung {s.get(20)} W"), (abs(s.get(9)/100 - 16903) < 5, f"Distanz {s.get(9)/100:.0f} m"),
          (s.get(45) == 250, "FTP gespeichert")]
for c, m in checks: print(("OK   " if c else "FAIL ") + m)
sys.exit(0 if all(c for c, _ in checks) else 1)

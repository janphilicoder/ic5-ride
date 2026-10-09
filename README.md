# IC5 Ride

Web-App für das **Life Fitness IC5 (ICG WattRate LCD Computer, Version 2016)** im Verein:
Leistung, Trittfrequenz und Puls per **ANT+-USB-Stick** (WebUSB in Chrome/Android) aufzeichnen,
Leistung korrigieren, virtuelle Distanz berechnen und als **FIT-Datei** (Indoor Cycling) für Garmin Connect / Strava exportieren.

**App:** https://janphilicoder.github.io/ic5-ride/ (GitHub Pages, Branch `main`, Root)

## Bedienung
1. Venu 3: „HF übertragen“ einschalten (keine Aktivität auf der Uhr starten).
2. Rad antreten → ANT+-Stick per USB-C-OTG ans Handy → App → „Verbinden“.
3. Prüfen, ob U/min zum Treten passen (gekoppelt wird das *nächstgelegene* Rad, Geräte-Nr. wird gespeichert).
4. Modus wählen (Freie Fahrt / Rampentest) → Start → Beenden → „FIT-Datei speichern“.
5. Upload: connect.garmin.com → Daten importieren; strava.com/upload/select.

## Technik
| Teil | Umsetzung |
|---|---|
| ANT+ | WebUSB, Vendor 0x0FCF (USB-m direkt, USB2/0x1008 über CP210x-Init). Kanäle: Bicycle Power (Typ 11, Seite 0x10), FE-C (Typ 17, Seite 0x19), HRM (Typ 120). Näherungssuche Bin 3, Geräte-Nr. in localStorage. |
| Leistung | aus kumulierter Leistung (ΔAccPower/ΔEventCount), 0 W nach 3 s ohne Ereignis; Korrektur P = a·P_IC5 + b |
| Distanz | virtuelle Geschwindigkeit in der Ebene: P = v·(½ρ·CdA·v² + Crr·m·g), ρ=1,2, CdA=0,32, Crr=0,004 |
| Auswertung | 7 Coggan-Zonen, NP (30-s-Mittel⁴), IF, TSS, Bestwerte 1/5/20 min |
| Rampentest | Start/Schritt einstellbar (Standard 100 W, +20 W/min), FTP = 0,75 × beste 1-min-Leistung |
| Export | eigener FIT-Encoder: file_id, event, record, lap, session (sport 2 / sub_sport 6), activity |
| Robustheit | Fahrt alle 10 s in localStorage, Wiederherstellung nach Neuladen; Wake Lock; Service Worker (offline) |
| Fallback | Web Bluetooth: FTMS 0x1826, Cycling Power 0x1818, HR 0x180D; Demo-Daten zum Testen |

## Projektstand / Erkenntnisse
- Konsole: WattRate LCD (2016), ±10 % laut Handbuch, Leistung = f(Bremsposition, Drehzahl). Bremskalibrierung: Startbildschirm, Pfeil-runter + Licht ≥ 3 s.
- Bluetooth der Konsole vermutlich nur für die ICG-App (proprietär); Standarddaten kommen per ANT+ (Zwift-Forum: IC5-Nutzer brauchen ANT+→BLE-Bridge). **Noch per nRF-Scan zu bestätigen.**
- Vergleich Indoor vs. Rennrad mit Powermeter bei gleicher HF: Faktor 1,4–1,8, steigend mit Intensität. Vorläufig a = 1,5, b = 0.
- Venu 3 hat ein nRF-Connect-Fake-Advertising (0x1818/0x1816, auch mit GATT-Server) nicht gefunden → Handy-als-Sensor-Brücke zur Uhr verworfen.
- Handy: Samsung S23 (kein natives ANT+) + CooSpo ANT+ USB-Stick über USB-C-OTG.

## Offen
- [ ] Erster Test am Rad (WebUSB mit CooSpo-Stick, Kanäle, Kopplung)
- [ ] a/b sauber bestimmen: Stufentest (je 8 min ~100/130/160 W Display, 85 U/min, Brustgurt) vs. Rennrad
- [ ] Automatischer Upload zu Strava (OAuth; Client-Secret nicht ins Repo) / Garmin Connect (ggf. über Raspberry Pi)
- [ ] Strukturierte Workouts mit Leistungszielen

## Werkzeuge
- `tools/fit_power_fix.py` – korrigiert Leistung in bestehenden FIT-Dateien (`python fit_power_fix.py *.fit --scale 1.5`), inkl. NP/IF/TSS und CRC.

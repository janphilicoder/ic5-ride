# CLAUDE.md – Arbeitsregeln für dieses Repo

## Kontext
Web-App „IC5 Ride“ für das Life Fitness IC5 (ICG WattRate LCD, 2016) im Sportverein. Nutzer: Rennradfahrer
mit Powermeter, Garmin-Uhr (Venu 3), Android-Handy (Samsung S23), CooSpo ANT+-USB-Stick (USB-C-OTG).
Projektstand, Messwerte und offene Punkte stehen in **README.md** – vor jeder Änderung lesen und nach
jeder relevanten Erkenntnis dort aktualisieren (Abschnitte „Projektstand“ und „Offen“).

## Kommunikation
- Immer **Deutsch** antworten.
- Schritt-für-Schritt-Vorgehen („Schema F“) mit physikalischer Begründung.
- Formeln mit echten Indizes/Brüchen (z. B. P<sub>IC5</sub>), keine Unterstrich-Notation.
- Aussagen belegen (Quelle/Messung) und Unsicherheiten offen benennen; der Nutzer hakt bei Ungenauem nach.

## Randbedingungen der App
- Läuft als **eine statische Seite** über GitHub Pages: https://janphilicoder.github.io/ic5-ride/
  Kein Build-Schritt, keine Abhängigkeiten, keine externen Skripte – alles in `index.html`.
- Zielplattform: **Chrome auf Android** (WebUSB für ANT+, Web Bluetooth als Fallback). HTTPS ist Pflicht.
- Bedienung im Kurs muss in < 1 min gehen, Anzeige groß und ohne Brille lesbar.
- Keine Geheimnisse ins Repo (öffentlich!). Strava-Client-Secret o. Ä. nie committen.
- `sw.js`: Cache-Namen (`ic5-vN`) bei jeder Auslieferung hochzählen.

## Aufbau von index.html
- `<script id="core">`: reine Funktionen (ANT-Nachrichten/Parser, Leistungsberechnung, Physik,
  Zonen/NP/TSS, FIT-Encoder). **Nur hier Logik ändern, die getestet werden kann.**
- Zweites `<script>`: UI, WebUSB/ANT-Kanäle, Bluetooth, Aufnahme, Zusammenfassung, Export.

## Tests (vor jedem Commit)
```
node tests/core.test.js && python3 tests/check_fit.py
```
`tests/fitdec.py` ist ein unabhängiger FIT-Decoder zur Gegenprüfung. UI-Änderungen zusätzlich im
Browser mit „Demo-Daten“ (Diagnose-Bereich) in Handygröße (390×844) prüfen.

## Werkzeuge
- `tools/fit_power_fix.py` – Leistung in vorhandenen FIT-Dateien korrigieren (P = a·P + b).

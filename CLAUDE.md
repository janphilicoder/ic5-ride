# CLAUDE.md – Arbeitsregeln für dieses Repo

## Kontext
Web-App „IC5 Ride“ für Indoor-Cycling-Räder vom Typ Life Fitness IC5 (ICG WattRate LCD).
Das Repo ist **öffentlich**: keine Messwerte, Trainingsdaten, Gerätenamen oder sonstigen
persönlichen Angaben hineinschreiben – weder in Dateien noch in Commit-Nachrichten.
Das README beschreibt nur, was die App tut, und nennt ihre Adresse; Projektstand und offene
Punkte gehören nicht hinein.

## Kommunikation
- Immer **Deutsch** antworten.
- Schritt-für-Schritt-Vorgehen („Schema F“) mit physikalischer Begründung.
- Formeln mit echten Indizes/Brüchen (z. B. P<sub>IC5</sub>), keine Unterstrich-Notation.
- Aussagen belegen (Quelle/Messung) und Unsicherheiten offen benennen; der Nutzer hakt bei Ungenauem nach.

## Randbedingungen der App
- Läuft als **eine statische Seite** über GitHub Pages: https://janphilicoder.github.io/ic5-ride/
  Kein Build-Schritt, keine Abhängigkeiten, keine externen Skripte – alles in `index.html`.
- Zielplattform: **Chrome auf Android** (Web Bluetooth). HTTPS ist Pflicht.
- Die App greift **auf kein Netz zu**: keine externen Skripte, kein `fetch` außer dem eigenen
  Offline-Cache. Das soll so bleiben – jede neue Netzverbindung ist eine bewusste Entscheidung.
- Bedienung im Kurs muss in < 1 min gehen, Anzeige groß und ohne Brille lesbar.
- Keine Geheimnisse ins Repo (öffentlich!). Strava-Client-Secret o. Ä. nie committen.
- `sw.js`: Cache-Namen (`ic5-vN`) bei jeder Auslieferung hochzählen.

## Aufbau von index.html
- `<script id="core">`: reine Funktionen (Bluetooth-Parser, Physik, Zonen/NP/TSS, Workout-Plan,
  FIT-Encoder). **Nur hier Logik ändern, die getestet werden kann.**
- Zweites `<script>`: UI, Bluetooth-Verbindungen, Aufnahme, Zusammenfassung, Export.
- In `innerHTML` nur selbst erzeugte Zahlen und Texte – Gerätenamen und andere Fremddaten
  ausschließlich über `textContent`.

## Tests (vor jedem Commit)
```
node tests/core.test.js && python3 tests/check_fit.py
```
`tests/fitdec.py` ist ein unabhängiger FIT-Decoder zur Gegenprüfung. UI-Änderungen zusätzlich im
Browser mit „Demo-Daten“ (Diagnose-Bereich) in Handygröße (390×844) prüfen.

## Werkzeuge
- `tools/fit_power_fix.py` – Leistung in vorhandenen FIT-Dateien korrigieren (P = a·P + b).

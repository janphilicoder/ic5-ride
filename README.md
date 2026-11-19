# IC5 Ride

Web-App für das **Life Fitness IC5 (ICG WattRate LCD Computer, Version 2016)** im Verein:
Leistung, Trittfrequenz und Puls per **Bluetooth** (Web Bluetooth in Chrome/Android) aufzeichnen,
Leistung korrigieren, virtuelle Distanz berechnen und als **FIT-Datei** (Indoor Cycling) für Garmin Connect / Strava exportieren.

**App:** https://janphilicoder.github.io/ic5-ride/ (GitHub Pages, Branch `main`, Root)

> **09.10.2026: Die Seite war weg** (404 „Site not found", null Deployments laut API). Ursache war die
> Pages-Einstellung selbst, nicht der Code und nicht der Force-Push: Source neu auf „Deploy from a branch",
> Branch `main`, Ordner `/ (root)` gesetzt → Seite lädt wieder. Falls es erneut auftritt, zuerst dort nachsehen
> (*Settings* → *Pages*). Die leere `.nojekyll` im Root schaltet zusätzlich den Jekyll-Build ab.

## Bedienung
1. Brustgurt anlegen (Decathlon HRM Dual). Der Puls kommt **ausschließlich** vom Gurt.
2. Rad antreten (weckt die Konsole) → App → bei „Rad“ und „Brustgurt“ je auf **Verbinden**.
   Beim nächsten Mal docken beide von selbst an.
3. Prüfen, ob U/min zum Treten passen (gekoppelt wird das *nächstgelegene* Rad, Geräte-Nr. wird gespeichert).
4. Modus wählen (Freie Fahrt / Rampentest / 20-min-Test) → Start → Beenden → „FIT-Datei speichern / teilen“.
5. Hochladen: **Teilen** bietet die Datei direkt der Garmin-Connect-App an. Erscheint sie dort nicht,
   speichern und über die Knöpfe „Garmin Connect öffnen“ bzw. „Strava öffnen“ von Hand importieren.

### Aufs Handy legen (ohne Laptop)
Seite in Chrome öffnen → Karte „Aufs Handy legen“ → **Installieren** (oder Chrome-Menü ⋮ →
„App installieren“). Danach startet sie vom Startbildschirm ohne Adresszeile und dank Service Worker
auch ohne Netz. Alle Einstellungen – Radnummern, Kalibrierung je Rad, FTP – liegen im Handy und
lassen sich dort ändern; der Laptop wird nur zum Ändern des Codes gebraucht.

## Technik
| Teil | Umsetzung |
|---|---|
| Bluetooth | Web Bluetooth, zwei getrennte Verbindungen. Rad: **FTMS** (0x1826 / 0x2AD2) bevorzugt, sonst **Cycling Power** (0x1818 / 0x2A63) als Rückfall. Gurt: **Herzfrequenz** (0x180D / 0x2A37). Geräte-IDs in localStorage; beim Start docken bekannte Geräte über `getDevices()` ohne Nutzergeste wieder an, nach einem Abbruch mit wachsendem Abstand (2, 4, 8 … max 30 s). |
| Leistung | aus kumulierter Leistung (ΔAccPower/ΔEventCount), 0 W nach 3 s ohne Ereignis; Korrektur P = a·P_IC5 + b **je Rad** |
| Anpassung | **Ein** Faktorpaar für alle Räder: P = a·P<sub>IC5</sub> + b, Standard **a = 1** (Bremse kalibriert), in den Einstellungen änderbar und je Fahrt mitgeschrieben. Eine Bibliothek je Rad gab es bis 10.10.2026; sie ist entfernt, weil die Räder bei kalibrierter Bremse nah beieinanderliegen. |
| Puls | **nur Brustgurt**: 0x180D auf einem eigenen Gurt-Gerät; das Rad wird nie nach HF gefragt. Bluetooth kennt keinen Schlagzähler, deshalb gilt ein über 20 s unveränderter Wert als eingefroren (Gurt abgelegt) und wird verworfen. |
| Geschwindigkeit | meldet das Rad eine (FTMS-Feld „Instantaneous Speed“), gilt sie; sonst virtuell in der Ebene gerechnet: P = v·(½ρ·CdA·v² + Crr·m·g), ρ=1,2, CdA=0,32, Crr=0,004. Die Distanz summiert sich daraus Sekunde für Sekunde und landet so in der FIT-Datei. |
| Auswertung | 7 Coggan-Zonen, NP (30-s-Mittel⁴), IF, TSS, Bestwerte 1/5/20 min |
| FTP-Tests | **Rampentest**: Start/Schritt einstellbar (Standard 100 W, +20 W/min), Vorschlag = 0,75 × beste 1-min-Leistung. **20-min-Test**: kein Zielwert, die App zeigt Restzeit und bisherigen Schnitt, Vorschlag = 0,95 × beste 20-min-Leistung (unter 20 min kein Vorschlag). Beides bleibt ein **Vorschlag** – übernommen wird er per Knopf, und die FTP ist in den Einstellungen jederzeit von Hand änderbar. |
| Hochladen | **Vollautomatisch nicht möglich.** Garmins Connect-Developer-Programm nimmt seit 2026 keine neuen Anträge an (Stand 10.10.2026), und Strava kennt kein PKCE: der Token-Tausch verlangt ein Client-Secret, das eine Seite ohne Server nicht geheim halten kann. Deshalb Web Share API (`navigator.share`) als kürzester Weg plus Direktlinks zu beiden Import-Seiten. |
| Export | eigener FIT-Encoder: file_id, event, record, lap, session (sport 2 / sub_sport 6), activity |
| Robustheit | Fahrt alle 10 s in localStorage, Wiederherstellung nach Neuladen; Wake Lock; Service Worker (offline) |
| Auslieferung | GitHub Pages aus Branch `main`, Ordner Root. Alle Verweise in `index.html`, `manifest.webmanifest` und `sw.js` sind **relativ** (`./`, `index.html`, `icon-192.png`), damit die App unter dem Unterpfad `/ic5-ride/` läuft. `.nojekyll` überspringt den Jekyll-Build. |
| Installation | Web-App-Manifest mit PNG-Icons (192/512, aus `icon.svg` gerendert) + `beforeinstallprompt`-Knopf → Startbildschirm, `display: standalone` |
| Fallback | Web Bluetooth: FTMS 0x1826, Cycling Power 0x1818, HR 0x180D; Demo-Daten zum Testen |
| Diagnose | „Bericht kopieren" legt Zustand (verbundene Geräte, a/b, **Rohleistung → korrigierte Leistung**, Herkunft der Geschwindigkeit) und Log in die Zwischenablage – am Rad steht nur das Handy zur Verfügung |

## Projektstand / Erkenntnisse
- Konsole: WattRate LCD (2016), ±10 % laut Handbuch, Leistung = f(Bremsposition, Drehzahl). Bremskalibrierung: Startbildschirm, Pfeil-runter + Licht ≥ 3 s.
- Bluetooth der Konsole vermutlich nur für die ICG-App (proprietär); Standarddaten kommen per ANT+ (Zwift-Forum: IC5-Nutzer brauchen ANT+→BLE-Bridge). **Noch per nRF-Scan zu bestätigen.**
- Vergleich Indoor vs. Rennrad mit Powermeter bei gleicher HF: Faktor 1,4–1,8, steigend mit Intensität.
  **Diese Messung stammt von einem Rad mit nicht kalibrierter Bremse** – nach der Bremskalibrierung
  deutet alles auf a ≈ 1 hin (s. 09.10.2026). Der Standardwert 1,5 in `BIKE_DEF` ist damit fraglich.
- Venu 3 hat ein nRF-Connect-Fake-Advertising (0x1818/0x1816, auch mit GATT-Server) nicht gefunden → Handy-als-Sensor-Brücke zur Uhr verworfen.
- Handy: Samsung S23 (kein natives ANT+) + CooSpo ANT+ USB-Stick über USB-C-OTG.
- Puls kommt vom Decathlon-Brustgurt (HRM Dual, ANT+ und Bluetooth). Die Konsole als Pulsquelle ist
  bewusst ausgeschlossen: sie zeigt die HF eines beliebigen gekoppelten Gurts in Reichweite an.
- **09.10.2026, erster Test am Rad – der ANT+-Empfang und die Leistungsberechnung stimmen.**
  Fahrt 19:08, 50 min. App und Venu 3 lasen **unabhängig voneinander dieselbe Konsole** (die Uhr war
  direkt mit Bicycle Power + Trittfrequenz vom Rad und dem Gurt gekoppelt, als Indoor-Radfahrt).
  Im gemeinsamen Zeitfenster von 1626 s:

  | | Ø Leistung | max |
  |---|---|---|
  | Uhr (Garmin-Original-FIT) | 228,1 W | 390 W |
  | App | 228,5 W | 393 W |

  Verhältnis der Mittelwerte **1,0018**. Einzelne Sekunden weichen ab (nur 37 % bitgleich), weil die
  Uhr mit *smart recording* abtastet und beide ΔAccPower/ΔEventCount zu leicht verschobenen Zeitpunkten
  auswerten – im Mittel hebt sich das auf. Damit ist der ANT+-Parser samt Leistungsberechnung gegen ein
  unabhängiges Gerät geprüft.
- **19.11.2026: auf Bluetooth umgestellt, ANT+ ist raus.** Der USB-Stick ging zurück; die Konsole
  bietet Bluetooth im Menü an, und die Hersteller-App nutzt es ebenfalls. Damit entfallen WebUSB,
  die ANT+-Kanäle und der FE-C-Sender an die Uhr – letzterer war ohnehin nie getestet (in der
  Garmin-Datei vom 09.10. stand kein Gerätetyp 17). Die Uhr bleibt künftig außen vor: aufgezeichnet
  wird in der App, hochgeladen wird die FIT-Datei nach Garmin Connect.
- **Nach der Bremskalibrierung der Konsole scheint a ≈ 1 zu stimmen – der Standard 1,5 stammt vom
  unkalibrierten Rad.** Mit a = 1 ergab die Fahrt NP 290 W bei einer am Rennrad gesetzten FTP von
  320 W, also IF 0,91 über 29 min, bei Ø 158 bpm. Zum Vergleich die Straßenfahrt vom 07.10. mit
  Powermeter: Ø 206 W bei Ø 148 bpm. Das passt zusammen, **ist aber nur ein HF-Plausibilitätsargument
  und kein Beleg** – dafür braucht es weiterhin die gleichzeitige Messung gegen einen Powermeter.
- Nebenbefunde: Die Uhr übernimmt Geschwindigkeit und Distanz nicht (Indoor-Aktivitäten verwerfen sie),
  die virtuelle Distanz gibt es nur in der FIT der App. Der App fehlten 43 von 3016 Pulswerten
  (Gurt-Aussetzer), der Uhr nicht.
- Noch offen: ob die Konsole über Bluetooth die **Standardprofile** sendet (0x1826 FTMS / 0x1818
  Cycling Power) oder etwas Proprietäres. Die App probiert FTMS zuerst, dann Cycling Power; meldet
  der Diagnose-Bereich „keine Standarddaten", liefert die Konsole nur Eigenes und es bräuchte eine
  Analyse ihres Dienstes.
- Die App greift **auf kein Netz zu**: keine externen Skripte, kein `fetch` außer dem Service-Worker-Cache
  der eigenen Dateien. Alles – Anpassung, FTP, laufende Fahrt, Geräte-IDs – liegt im `localStorage` des
  Handys und verlässt das Gerät nie. Damit gibt es im Repo auch nichts Geheimzuhaltendes.

## Offen
- [x] ~~Erster Test am Rad~~ – 09.10.2026 gelaufen, Empfang und Leistungsberechnung bestätigt
- [ ] **Erster Test mit Bluetooth am Rad** – koppelt die Konsole, liefert sie FTMS oder Cycling Power,
      kommt eine Geschwindigkeit mit? Im Diagnose-Bereich „Bericht kopieren" drücken.
- [ ] a/b sauber bestimmen: Stufentest (je 8 min ~100/130/160 W Display, 85 U/min, Brustgurt) vs. Rennrad
- [ ] Prüfen, ob „Teilen“ auf dem S23 die Garmin-Connect-App in der Liste anbietet (hängt davon ab, ob
      Chrome den MIME-Typ durchreicht und Garmin einen Intent für FIT registriert)
- ~~Automatischer Upload zu Strava / Garmin Connect~~ – **nicht möglich.** Garmins
  Connect-Developer-Programm nimmt seit 2026 keine neuen Anträge an, und Strava kennt kein PKCE:
  der Token-Tausch verlangt ein Client-Secret, das eine Seite ohne Server nicht geheim halten kann.
  Deshalb Teilen über die Web Share API plus Direktlinks zu beiden Import-Seiten.
- [ ] Strukturierte Workouts mit Leistungszielen

## Werkzeuge
- `tools/fit_power_fix.py` – korrigiert Leistung in bestehenden FIT-Dateien (`python fit_power_fix.py *.fit --scale 1.5`), inkl. NP/IF/TSS und CRC.

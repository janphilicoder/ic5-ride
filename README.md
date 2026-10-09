# IC5 Ride

Web-App für das **Life Fitness IC5 (ICG WattRate LCD Computer, Version 2016)** im Verein:
Leistung, Trittfrequenz und Puls per **ANT+-USB-Stick** (WebUSB in Chrome/Android) aufzeichnen,
Leistung korrigieren, virtuelle Distanz berechnen und als **FIT-Datei** (Indoor Cycling) für Garmin Connect / Strava exportieren.

**App:** https://janphilicoder.github.io/ic5-ride/ (GitHub Pages, Branch `main`, Root)

> **09.10.2026: Die Seite war weg** (404 „Site not found", null Deployments laut API). Ursache war die
> Pages-Einstellung selbst, nicht der Code und nicht der Force-Push: Source neu auf „Deploy from a branch",
> Branch `main`, Ordner `/ (root)` gesetzt → Seite lädt wieder. Falls es erneut auftritt, zuerst dort nachsehen
> (*Settings* → *Pages*). Die leere `.nojekyll` im Root schaltet zusätzlich den Jekyll-Build ab.

## Bedienung
1. Brustgurt anlegen (Decathlon HRM Dual, ANT+). Der Puls kommt **ausschließlich** vom Gurt.
2. Rad antreten → ANT+-Stick per USB-C-OTG ans Handy → App → „Verbinden“.
3. Prüfen, ob U/min zum Treten passen (gekoppelt wird das *nächstgelegene* Rad, Geräte-Nr. wird gespeichert).
4. **Radnummer** eintragen, die am Rad klebt – beim nächsten Mal wird das Rad an seiner Geräte-Nr. wiedererkannt
   und rechnet mit seiner eigenen Korrektur.
5. Modus wählen (Freie Fahrt / Rampentest) → Start → Beenden → „FIT-Datei speichern“.
6. Upload: connect.garmin.com → Daten importieren; strava.com/upload/select.

### Statt Import: direkt auf der Uhr aufzeichnen
„An Uhr senden“ einschalten → die App sendet die korrigierte Leistung als ANT+-Smart-Trainer.
Auf der Uhr (Venu 3, Edge 540) unter *Sensoren & Zubehör → Hinzufügen → Smart-Trainer* koppeln,
dann dort eine Indoor-Aktivität starten. Die Uhr bekommt Leistung, Trittfrequenz, Geschwindigkeit
und Distanz; den Puls misst sie selbst. Die FIT-Datei der App bleibt als Sicherung bestehen –
nur eine von beiden hochladen, sonst liegt die Fahrt doppelt in Garmin Connect.

### Aufs Handy legen (ohne Laptop)
Seite in Chrome öffnen → Karte „Aufs Handy legen“ → **Installieren** (oder Chrome-Menü ⋮ →
„App installieren“). Danach startet sie vom Startbildschirm ohne Adresszeile und dank Service Worker
auch ohne Netz. Alle Einstellungen – Radnummern, Kalibrierung je Rad, FTP – liegen im Handy und
lassen sich dort ändern; der Laptop wird nur zum Ändern des Codes gebraucht.

## Technik
| Teil | Umsetzung |
|---|---|
| ANT+ | WebUSB, Vendor 0x0FCF (USB-m direkt, USB2/0x1008 über CP210x-Init). Kanäle: Bicycle Power (Typ 11, Seite 0x10), FE-C (Typ 17, Seite 0x19), HRM (Typ 120). Näherungssuche Bin 3, Geräte-Nr. in localStorage. |
| Leistung | aus kumulierter Leistung (ΔAccPower/ΔEventCount), 0 W nach 3 s ohne Ereignis; Korrektur P = a·P_IC5 + b **je Rad** |
| Räder | Bibliothek `BIKES_SEED` (Rad 1–12) mit a, b, Kalibrierdatum, n und sd. Zuordnung ANT+-Geräte-Nr. → Radnummer wird beim ersten Eintragen gelernt und in localStorage gehalten; BLE-Name („IC5-07“) nur als Rückfall. Liste nach Unsicherheit sd/√n sortiert, ★ = genauestes Rad. Rad und benutztes a/b werden je Fahrt mitgeschrieben. |
| Puls | **nur Brustgurt**: ANT+ Gerätetyp 120 oder BLE 0x180D auf einem eigenen Gurt-Gerät. HF von Rad/Konsole wird verworfen, ebenso ein eingefrorener Wert (Schlagzähler steht > 10 s → kein Puls). |
| Distanz | virtuelle Geschwindigkeit in der Ebene: P = v·(½ρ·CdA·v² + Crr·m·g), ρ=1,2, CdA=0,32, Crr=0,004 |
| Auswertung | 7 Coggan-Zonen, NP (30-s-Mittel⁴), IF, TSS, Bestwerte 1/5/20 min |
| Rampentest | Start/Schritt einstellbar (Standard 100 W, +20 W/min), FTP = 0,75 × beste 1-min-Leistung |
| Export | eigener FIT-Encoder: file_id, event, record, lap, session (sport 2 / sub_sport 6), activity |
| An die Uhr senden | Stick zusätzlich als **ANT+-Master** (Kanal 3, Gerätetyp 17 FE-C, Übertragungstyp 5, 4 Hz). Gesendet werden die **korrigierte** Leistung und die **virtuelle** Geschwindigkeit, Seiten 0x10/0x19 im Wechsel, alle 66 Nachrichten 0x50/0x51. Takt kommt von EVENT_TX, nicht von `setInterval`. Eigene Geräte-Nr. wird gewürfelt und gespeichert; koppelt der Empfangskanal sie versehentlich, wird sie abgelehnt (sonst liefe die Korrektur im Kreis). |
| Robustheit | Fahrt alle 10 s in localStorage, Wiederherstellung nach Neuladen; Wake Lock; Service Worker (offline) |
| Auslieferung | GitHub Pages aus Branch `main`, Ordner Root. Alle Verweise in `index.html`, `manifest.webmanifest` und `sw.js` sind **relativ** (`./`, `index.html`, `icon-192.png`), damit die App unter dem Unterpfad `/ic5-ride/` läuft. `.nojekyll` überspringt den Jekyll-Build. |
| Installation | Web-App-Manifest mit PNG-Icons (192/512, aus `icon.svg` gerendert) + `beforeinstallprompt`-Knopf → Startbildschirm, `display: standalone` |
| Fallback | Web Bluetooth: FTMS 0x1826, Cycling Power 0x1818, HR 0x180D; Demo-Daten zum Testen |
| Diagnose | „Bericht kopieren" legt Zustand (Stick, Kanalzahl, gekoppelte Geräte-Nrn., Sender, Rad samt a/b, **Rohleistung → korrigierte Leistung**) und Log in die Zwischenablage – am Rad steht nur das Handy zur Verfügung |

## Projektstand / Erkenntnisse
- Konsole: WattRate LCD (2016), ±10 % laut Handbuch, Leistung = f(Bremsposition, Drehzahl). Bremskalibrierung: Startbildschirm, Pfeil-runter + Licht ≥ 3 s.
- Bluetooth der Konsole vermutlich nur für die ICG-App (proprietär); Standarddaten kommen per ANT+ (Zwift-Forum: IC5-Nutzer brauchen ANT+→BLE-Bridge). **Noch per nRF-Scan zu bestätigen.**
- Vergleich Indoor vs. Rennrad mit Powermeter bei gleicher HF: Faktor 1,4–1,8, steigend mit Intensität. Vorläufig a = 1,5, b = 0.
- Venu 3 hat ein nRF-Connect-Fake-Advertising (0x1818/0x1816, auch mit GATT-Server) nicht gefunden → Handy-als-Sensor-Brücke zur Uhr verworfen.
- Handy: Samsung S23 (kein natives ANT+) + CooSpo ANT+ USB-Stick über USB-C-OTG.
- Puls kommt vom Decathlon-Brustgurt (HRM Dual, ANT+ und Bluetooth). Die Konsole als Pulsquelle ist
  bewusst ausgeschlossen: sie zeigt die HF eines beliebigen gekoppelten Gurts in Reichweite an.
- Die App greift **auf kein Netz zu**: keine externen Skripte, kein `fetch` außer dem Service-Worker-Cache
  der eigenen Dateien. Alles – Radnummern, Kalibrierung, FTP, laufende Fahrt – liegt im `localStorage` des
  Handys und verlässt das Gerät nie. Damit gibt es im Repo auch nichts Geheimzuhaltendes.
- Stand 09.10.2026: **kein Rad einzeln kalibriert.** Alle Räder rechnen mit dem Standard a = 1,5, b = 0;
  die Bibliothek ist angelegt (Rad 1–12), die Messwerte fehlen noch. Die Räder sollten sich wenig
  unterscheiden, belegt ist das aber nicht – laut Handbuch streut die Konsole ±10 %.

## Offen
- [ ] Erster Test am Rad (WebUSB mit CooSpo-Stick, Kanäle, Kopplung) – im Diagnose-Bereich
      **„Bericht kopieren"** drücken, der Bericht enthält Stick, Kanalzahl, Kopplung, Roh- und Korrekturwert
- [ ] a/b sauber bestimmen: Stufentest (je 8 min ~100/130/160 W Display, 85 U/min, Brustgurt) vs. Rennrad
- [ ] a/b **je Rad** messen und in die Bibliothek eintragen (a, b, cal, n, sd) – erst dann ist die
      Rangliste „genauestes Rad“ aussagekräftig
- [ ] Zahl der Räder im Verein prüfen – die Bibliothek ist mit 1–12 vorbelegt, neue Nummern legt die App
      beim Eintragen selbst an
- [ ] Senden an die Uhr am Rad prüfen (koppelt die Venu 3 den Kanal, stimmen Leistung/Distanz, hält der Stick 4 Kanäle)
- ~~Automatischer Upload zu Strava / Garmin Connect~~ – **verworfen (09.10.2026).** Die Uhr zeichnet über
  den FE-C-Sender selbst auf und synchronisiert von sich aus nach Garmin Connect, von dort weiter zu Strava.
  Ein Upload aus der App wäre ein dritter Weg für dieselbe Fahrt. Damit bleibt die App ohne jeden
  Netzwerkzugriff – kein OAuth, kein Client-Secret, nichts, was geheim bleiben müsste.
  *Wieder aufgreifen nur, falls das Senden an die Uhr am Rad scheitert; dann genügt aber der FIT-Export
  mit Hochladen von Hand.*
- [ ] Strukturierte Workouts mit Leistungszielen

## Werkzeuge
- `tools/fit_power_fix.py` – korrigiert Leistung in bestehenden FIT-Dateien (`python fit_power_fix.py *.fit --scale 1.5`), inkl. NP/IF/TSS und CRC.

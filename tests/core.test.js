// Tests der reinen Logik (Bluetooth-Parser, Physik, Auswertung, FIT-Encoder).
// Aufruf: node tests/core.test.js   -> schreibt tests/out/test.fit, danach: python3 tests/check_fit.py
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const core = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const C = new Function("module", core + "\nreturn Core;")({});
let fails = 0; const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if(!c) fails++; };

// Hilfe: DataView aus Bytes bauen, wie eine BLE-Benachrichtigung sie liefert.
const dv = b => new DataView(new Uint8Array(b).buffer);

// ---- FTMS Indoor Bike Data (0x2AD2) ----
// Flags 0x0044: Bit 0 = 0 -> Geschwindigkeit dabei, Bit 2 -> Trittfrequenz, Bit 6 -> Leistung.
let f = C.parseFtms(dv([0x44,0x00, 0x10,0x0E, 0xA4,0x00, 0xC8,0x00]));
ok(Math.abs(f.speed - 36.0) < 1e-9, "FTMS: Geschwindigkeit 0,01 km/h -> 36,0 km/h");
ok(f.cad === 82, "FTMS: Trittfrequenz 0,5 1/min -> 82");
ok(f.power === 200, "FTMS: Leistung 200 W");
// Flags 0x0041: Bit 0 = 1 -> keine Geschwindigkeit; Bit 6 -> Leistung rückt zwei Byte vor.
f = C.parseFtms(dv([0x41,0x00, 0xC8,0x00]));
ok(f.speed === null && f.power === 200, "FTMS: ohne Geschwindigkeit rückt die Leistung vor");
// Flag gesetzt, Daten zu kurz: nichts lesen statt abstürzen.
ok(C.parseFtms(dv([0x44,0x00, 0x10,0x0E])).power === null, "FTMS: zu kurze Nachricht wirft nicht");
ok(C.parseCps(dv([0x20,0x00, 0xC8,0x00])).revs === null, "CPS: zu kurze Nachricht wirft nicht");
// Flags 0x0050: Geschwindigkeit, Distanz (24 Bit) und Leistung, keine Trittfrequenz.
f = C.parseFtms(dv([0x50,0x00, 0x10,0x0E, 0xE8,0x03,0x00, 0xC8,0x00]));
ok(f.dist === 1000 && f.power === 200, "FTMS: Distanz 24 Bit, danach Leistung");
ok(C.parseFtms(dv([0x00,0x00, 0x10,0x0E])).power === null, "FTMS: ohne Leistungsbit kein Wert");

// ---- Cycling Power Measurement (0x2A63) ----
// Flags 0x0020: nur Kurbeldaten. Leistung steht immer an Byte 2.
let c = C.parseCps(dv([0x20,0x00, 0xC8,0x00, 0x0A,0x00, 0x00,0x04]));
ok(c.power === 200 && c.revs === 10 && c.t1024 === 1024, "CPS: Leistung und Kurbeldaten");
// Flags 0x0035: Balance (1 B) + Drehmoment (2 B) + Radumdrehungen (6 B) vor der Kurbel.
c = C.parseCps(dv([0x35,0x00, 0xC8,0x00, 0x32, 0x00,0x00, 0,0,0,0,0,0, 0x14,0x00, 0x00,0x08]));
ok(c.power === 200 && c.revs === 20 && c.t1024 === 2048, "CPS: optionale Felder verschieben die Kurbeldaten");
ok(C.parseCps(dv([0x00,0x00, 0x9C,0xFF])).power === -100, "CPS: Leistung ist vorzeichenbehaftet");

// ---- Trittfrequenz aus Kurbelumdrehungen ----
const cc = C.makeCrankCalc();
cc(10, 1024, 0);
ok(Math.abs(cc(11, 2048, 1000) - 60) < 1e-9, "Kurbel: 1 Umdrehung je Sekunde = 60 1/min");
ok(Math.abs(cc(13, 3072, 2000) - 120) < 1e-9, "Kurbel: 2 Umdrehungen je Sekunde = 120 1/min");
// Beide Zähler laufen bei 2^16 über; die Differenz muss trotzdem stimmen.
const cc2 = C.makeCrankCalc();
cc2(65530, 65000, 0);
ok(Math.abs(cc2(2, 65000 + 1024 - 65536, 1000) - 480) < 1e-9, "Kurbel: Überlauf beider Zähler");
ok(cc(13, 3072, 9000) === 0, "Kurbel: ohne neue Umdrehung -> 0");

// ---- Herzfrequenz (0x2A37) ----
ok(C.parseHrm(dv([0x00, 142])) === 142, "HRM: 8-Bit-Wert");
ok(C.parseHrm(dv([0x01, 0x90,0x01])) === 400, "HRM: 16-Bit-Wert bei gesetztem Bit 0");

// ---- Puls: nur echte Schläge des Brustgurts ----
// Über Bluetooth gibt es keinen Schlagzähler, also zählt die Änderung des Werts.
const hc = C.makeHrCalc(20000);
ok(hc(140, 0) === 140, "HF gültig");
ok(hc(140, 19000) === 140, "HF bleibt gültig bis zur Grenze");
ok(hc(140, 21000) === null, "eingefrorener Wert -> verworfen (Gurt abgelegt)");
ok(hc(141, 22000) === 141, "neuer Wert -> wieder gültig");
ok(hc(0, 23000) === null, "HF 0 ist kein Puls");

// ---- VO2max 4x4: Plan ----
const VC = { vo2Reps:4, vo2Work:4, vo2Rest:3, vo2Warm:10, vo2Cool:5, vo2WorkPct:110, vo2RestPct:50 };
const pl = C.buildPlan(VC, 250);
ok(pl.steps.length === 9, "4x4: Einfahren + 4 Bloecke + 3 Pausen + Ausfahren = 9 Abschnitte");
ok(pl.total === (10 + 4*4 + 3*3 + 5) * 60, `Gesamtdauer ${pl.total/60} min`);
ok(pl.steps[1].w === 275 && pl.steps[2].w === 125, "110 % und 50 % von FTP 250");
ok(pl.steps[pl.steps.length-2].kind === "work" && pl.steps[pl.steps.length-1].kind === "cool",
   "nach dem letzten Block keine Erholung, sondern Ausfahren");
ok(pl.steps[0].t0 === 0 && pl.steps[1].t0 === 600 && pl.steps[2].t0 === 840, "Startzeiten summieren sich");

// Abweichende FTP wirkt auf alle Ziele, nicht auf die Zeiten.
const pl2 = C.buildPlan(VC, 300);
ok(pl2.steps[1].w === 330 && pl2.total === pl.total, "andere FTP -> andere Watt, gleiche Dauer");

// Ohne Ein- und Ausfahren bleiben nur Bloecke und Pausen.
const pl3 = C.buildPlan({...VC, vo2Warm:0, vo2Cool:0}, 250);
ok(pl3.steps.length === 7 && pl3.total === (4*4 + 3*3)*60, "ohne Ein-/Ausfahren 7 Abschnitte, 25 min");

// planAt: Grenzen zwischen den Abschnitten
ok(C.planAt(pl, 0).step.kind === "warm", "Sekunde 0 -> Einfahren");
ok(C.planAt(pl, 599).step.kind === "warm" && C.planAt(pl, 600).step.kind === "work",
   "Wechsel genau bei 600 s, nicht davor");
const a1 = C.planAt(pl, 600);
ok(a1.left === 240 && a1.next.kind === "rest", "Restzeit und naechster Abschnitt");
ok(C.planAt(pl, 839).left === 1, "letzte Sekunde eines Abschnitts");
ok(C.planAt(pl, pl.total - 1).step.kind === "cool", "letzte Sekunde -> Ausfahren");
ok(C.planAt(pl, pl.total) === null && C.planAt(pl, pl.total + 99) === null, "nach dem Ende kein Abschnitt");
ok(C.planAt(pl, pl.total - 1).next === null, "letzter Abschnitt hat keinen naechsten");

const v = C.virtualSpeed(200, 109); ok(v*3.6 > 32 && v*3.6 < 35, `200 W -> ${(v*3.6).toFixed(1)} km/h`);
ok(C.zoneOf(140,250) === 1 && C.zoneOf(260,250) === 3 && C.zoneOf(400,250) === 6, "Zonen");
ok(Math.round(C.np(Array(600).fill(200))) === 200, "NP konstant");
ok(C.bestAvg([...Array(100).fill(100), ...Array(60).fill(300)], 60) === 300, "beste 60 s");

const t0 = Date.UTC(2026,9,9,18,0,0), S = []; let d = 0;
for(let i=0;i<1800;i++){ const p = Math.round(200+50*Math.sin(i/60)), s = C.virtualSpeed(p,109); d += s;
  S.push({t:t0+i*1000, p, raw:Math.round(p/1.5), cad:85, hr:140+(i%20), spd:s, dist:d}); }
const sum = C.summarize(S, 250);
ok(Math.abs(sum.tss - 1800*sum.np*sum.if/(250*3600)*100) < 1e-6, "TSS-Formel");
const fit = C.fitEncode(S, sum, 250, t0);
ok(C.crc16(fit) === 0, "FIT-CRC über ganze Datei = 0");
fs.mkdirSync(path.join(__dirname, "out"), {recursive:true});
fs.writeFileSync(path.join(__dirname, "out", "test.fit"), fit);
console.log(fails ? `${fails} Fehler` : "Alle Tests bestanden");
process.exit(fails ? 1 : 0);

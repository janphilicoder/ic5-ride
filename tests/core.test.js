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

// ---- Workouts: Plaene ----
const WC = { vo2Reps:4, vo2Work:4, vo2Rest:3, vo2Warm:10, vo2Cool:5, vo2WorkPct:110, vo2RestPct:50,
  i30Sets:3, i30Reps:10, i30Work:30, i30Rest:30, i30SetRest:5, i30Warm:10, i30Cool:5,
  i30WorkPct:130, i30RestPct:50,
  mxReps:8, mxWork:15, mxRest:3, mxWarm:10, mxCool:5, mxWorkPct:0, mxRestPct:50 };

const pl = C.buildPlan("vo2", WC, 250);
ok(pl.steps.length === 9, "4x4: Einfahren + 4 Bloecke + 3 Pausen + Ausfahren = 9 Abschnitte");
ok(pl.total === (10 + 4*4 + 3*3 + 5) * 60, `4x4 Gesamtdauer ${pl.total/60} min`);
ok(pl.steps[1].w === 275 && pl.steps[2].w === 125, "4x4: 110 % und 50 % von FTP 250");
ok(pl.steps[7].kind === "work" && pl.steps[8].kind === "cool",
   "4x4: nach dem letzten Block keine Erholung, sondern Ausfahren");
ok(C.buildPlan("vo2", WC, 300).steps[1].w === 330, "andere FTP -> andere Watt");
ok(C.buildPlan("vo2", {...WC, vo2Warm:0, vo2Cool:0}, 250).steps.length === 7, "ohne Ein-/Ausfahren 7 Abschnitte");

// 30/30: je Satz 10 harte + 9 kurze Pausen, dazwischen 2 Satzpausen, plus Ein-/Ausfahren.
const p30 = C.buildPlan("i3030", WC, 250);
ok(p30.steps.length === 3*(10+9) + 2 + 2, `30/30: ${p30.steps.length} Abschnitte`);
ok(p30.total === (10*60) + 3*(10*30 + 9*30) + 2*5*60 + (5*60), `30/30 Gesamtdauer ${Math.round(p30.total/60)} min`);
ok(p30.steps[1].w === 325 && p30.steps[1].sec === 30, "30/30: 130 % von FTP 250, 30 s");
ok(p30.steps[1].name === "Satz 1/3 · 1/10", "30/30: Satz und Wiederholung im Namen");
ok(p30.steps[20].name.startsWith("Satzpause"), "30/30: nach 10 Wiederholungen die Satzpause");
// Ein Satz: kein "Satz n/m" im Namen, keine Satzpause.
const p30a = C.buildPlan("i3030", {...WC, i30Sets:1}, 250);
ok(p30a.steps.filter(x => x.name.startsWith("Satzpause")).length === 0 && p30a.steps[1].name === "1/10",
   "30/30: ein Satz ohne Satzpause und ohne Satznummer");

// Sprints: all-out, deshalb ohne Zielwatt.
const pmx = C.buildPlan("maxp", WC, 250);
ok(pmx.steps.filter(x => x.kind === "sprint").length === 8, "Sprints: 8 Stueck");
ok(pmx.steps[1].w === null && pmx.steps[1].sec === 15, "Sprints: kein Zielwatt, 15 s");
ok(pmx.steps[2].w === 125, "Sprints: Erholung hat ein Ziel");
ok(C.buildPlan("maxp", {...WC, mxWorkPct:200}, 250).steps[1].w === 500, "Sprints: Ziel in % wenn gesetzt");
ok(C.buildPlan("quatsch", WC, 250) === null, "unbekanntes Workout -> null");

// ---- Vorschau: Zeilen zusammenfassen ----
// 30/30 hat ueber sechzig Abschnitte; ausgeschrieben waere die Vorschau unbrauchbar.
const rows30 = C.planRows(p30.steps);
ok(rows30.length < 12, `30/30: ${p30.steps.length} Abschnitte -> ${rows30.length} Zeilen`);
const paar = rows30.find(r => r.pair);
ok(paar && paar.cnt === 9 && paar.a.sec === 30 && paar.b.sec === 30,
   "30/30: neun hart/locker-Paare in einer Zeile");
ok(rows30[0].pair === false && rows30[0].a.kind === "warm" && rows30[0].cnt === 1,
   "Einfahren bleibt eine eigene Zeile");
// Sprints: Sprint und Erholung wiederholen sich ebenfalls als Paar.
const rowsMx = C.planRows(pmx.steps);
ok(rowsMx.length < 6 && rowsMx.some(r => r.pair && r.cnt === 7),
   `Sprints: ${pmx.steps.length} Abschnitte -> ${rowsMx.length} Zeilen`);
// 4x4 ebenso: Block/Erholung dreimal als Paar, der vierte Block einzeln.
const rowsVo2 = C.planRows(pl.steps);
ok(rowsVo2.some(r => r.pair && r.cnt === 3), "4x4: drei Block/Erholung-Paare");
// Jede Zeile muss alle Abschnitte abdecken, sonst waere die Gesamtdauer falsch.
const summe = r => r.reduce((a, x) => a + (x.pair ? (x.a.sec + x.b.sec) * x.cnt : x.a.sec * x.cnt), 0);
ok(summe(rows30) === p30.total && summe(rowsMx) === pmx.total && summe(rowsVo2) === pl.total,
   "zusammengefasste Zeilen ergeben die volle Dauer");
ok(C.planRows([]).length === 0, "leerer Plan -> keine Zeilen");
ok(C.planRows([pl.steps[0]]).length === 1, "ein Abschnitt -> eine Zeile");

// ---- Fortschritt: woTick / woAt ----
let st = { i:0, t:0, done:false };
ok(C.woAt(pl, st).step.kind === "warm" && C.woAt(pl, st).left === 600, "Start: Einfahren, volle Restzeit");
// 599 Sekunden ticken -> immer noch Einfahren, 1 s uebrig.
for(let k=0;k<599;k++) st = C.woTick(pl, st, false);
ok(st.i === 0 && C.woAt(pl, st).left === 1, "letzte Sekunde des Einfahrens");
st = C.woTick(pl, st, false);
ok(st.i === 1 && st.t === 0 && C.woAt(pl, st).step.kind === "work", "Wechsel in den ersten Block");
ok(C.woAt(pl, st).next.kind === "rest", "naechster Abschnitt ist die Erholung");

// Ueberspringen: sofort im naechsten Abschnitt, Rest des alten faellt weg.
let sk = C.woTick(pl, { i:0, t:5, done:false }, true);
ok(sk.i === 1 && sk.t === 0, "Skip springt zum naechsten Abschnitt");
// Skip im letzten Abschnitt beendet das Workout.
let last = { i: pl.steps.length-1, t:0, done:false };
ok(C.woTick(pl, last, true).done === true, "Skip im letzten Abschnitt -> fertig");
// Ohne Skip ebenso, wenn der letzte Abschnitt ablaeuft.
let end = { i: pl.steps.length-1, t: pl.steps[pl.steps.length-1].sec - 1, done:false };
ok(C.woTick(pl, end, false).done === true, "letzter Abschnitt laeuft ab -> fertig");
ok(C.woAt(pl, { i:0, t:0, done:true }) === null, "fertiges Workout hat keinen Abschnitt");
ok(C.woTick(pl, { i:0, t:0, done:true }, false).done === true, "fertig bleibt fertig");
ok(C.woTick(null, st, false) === st && C.woAt(null, st) === null, "ohne Plan passiert nichts");
// woTick veraendert den alten Zustand nicht (reine Funktion).
const vor = { i:2, t:7, done:false }, nach = C.woTick(pl, vor, false);
ok(vor.t === 7 && nach.t === 8, "woTick laesst den alten Zustand unberuehrt");

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

// Tests der reinen Logik (ANT-Parser, Leistungsberechnung, Physik, Auswertung, FIT-Encoder).
// Aufruf: node tests/core.test.js   -> schreibt tests/out/test.fit, danach: python3 tests/check_fit.py
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const core = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const C = new Function("module", core + "\nreturn Core;")({});
let fails = 0; const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if(!c) fails++; };

const m = C.antMsg(0x4A, [0]); ok([...m].join() === [0xA4,1,0x4A,0,0xA4^1^0x4A].join(), "antMsg Prüfsumme");
const pw = C.antMsg(0x4E, [0, 0x10,5,0xFF,90, 0x10,0x27, 200,0]);
let r = C.antParse(new Uint8Array([1,2,3, ...pw, ...pw.slice(0,5)])); ok(r.msgs.length === 1 && r.rest.length === 5, "antParse mit Rest");
r = C.antParse(new Uint8Array([...r.rest, ...pw.slice(5)])); ok(r.msgs.length === 1, "antParse Fragment zusammengesetzt");
const pp = C.parsePowerPage(r.msgs[0].data.slice(1)); ok(pp.page === 0x10 && pp.cad === 90 && pp.acc === 10000 && pp.inst === 200, "Power-Seite 0x10");
const pc = C.makePowerCalc(); pc(250, 65500, 0, 0);
ok(Math.abs(pc(253, (65500+3*180) & 0xFFFF, 170, 250) - 180) < 1e-9, "kumulierte Leistung mit Überlauf = 180 W");
ok(pc(253, (65500+3*180) & 0xFFFF, 170, 4000) === 0, "Stillstand -> 0 W");
const fe = C.parseFecPage([0x19,1,88,0x34,0x12,0x2C,0x31,0]); ok(fe.inst === 0x12C && fe.cad === 88, "FE-C Seite 0x19");

// ---- Puls: nur echte Schläge des Brustgurts ----
const hp = C.parseHrPage([0x84,0xFF,0xFF,0xFF,0x10,0x27,42,145]);
ok(hp.page === 0x04 && hp.beats === 42 && hp.hr === 145, "HRM-Seite: Seitennr. ohne Toggle-Bit, Schlagzähler, HF");
const hc = C.makeHrCalc(10000);
ok(hc({hr:145, beats:42}, 0) === 145, "HF mit Schlag");
ok(hc({hr:145, beats:42}, 9000) === 145, "HF bleibt gültig bis zur Grenze");
ok(hc({hr:145, beats:42}, 11000) === null, "ohne neuen Schlag -> HF verworfen (Gurt abgelegt)");
ok(hc({hr:145, beats:43}, 12000) === 145, "neuer Schlag -> wieder gültig");
ok(hc({hr:0, beats:44}, 13000) === null, "HF 0 ist kein Puls");

// ---- Rad-Bibliothek ----
ok(C.bikeNrFromName("IC5-07") === 7 && C.bikeNrFromName("ICG Bike 7") === 7, "Radnummer aus Namen");
ok(C.bikeNrFromName("IC5") === null && C.bikeNrFromName("IC5 2016") === null, "Modellname ergibt keine Radnummer");
const BK = { 3:{a:1.5,b:0,cal:null,n:0,sd:null}, 5:{a:1.44,b:5,cal:"2026-10-20",n:9,sd:6}, 8:{a:1.52,b:0,cal:"2026-10-21",n:4,sd:6} };
ok(C.bikeUncert(BK[3]) === Infinity && Math.abs(C.bikeUncert(BK[5]) - 2) < 1e-9, "Unsicherheit sd/√n");
ok(C.bikeRanking(BK).join() === "5,8,3", "genauestes Rad zuerst, nicht kalibrierte zuletzt");
const r1 = C.resolveBike(4711, "", {4711:5}, BK, {a:1.5,b:0});
ok(r1.nr === 5 && r1.a === 1.44 && r1.b === 5 && r1.calibrated, "Geräte-Nr. liefert Rad und dessen Korrektur");
const r2 = C.resolveBike(9999, "IC5-08", {4711:5}, BK, {a:1.5,b:0});
ok(r2.nr === 8 && r2.how === "Name", "unbekannte Geräte-Nr. -> Name als Rückfall");
const r3 = C.resolveBike(9999, "IC5", {}, BK, {a:1.7,b:2});
ok(r3.nr === null && r3.a === 1.7 && r3.b === 2 && !r3.calibrated, "nichts erkannt -> Standard aus den Einstellungen");
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

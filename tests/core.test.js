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

// ---- FE-C senden: die App als Trainer ----
ok(C.feNextPage(0) === 0x10 && C.feNextPage(1) === 0x19 && C.feNextPage(64) === 0x50 && C.feNextPage(65) === 0x51
   && C.feNextPage(66) === 0x10, "Seitenfolge 0x10/0x19 mit 0x50/0x51 alle 66");
const g = C.feBuildPage(0x10, {elapsedMs:10000, distM:300.7, speedMs:9.4, hr:142, cad:85, power:200, events:3, accPower:600, inUse:true});
ok(g[0] === 0x10 && g[1] === 25, "Seite 0x10: Nummer und Equipment Type Trainer");
ok(g[2] === 40 && g[3] === 44, "Zeit in 0,25 s (40) und Distanz mod 256 (44)");
ok((g[4] | g[5]<<8) === 9400 && g[6] === 142, "Geschwindigkeit 0,001 m/s und HF");
ok((g[7] >> 4) === 3 && (g[7] & 0x0F) === 0x07, "Zustand IN_USE, HF-Quelle ANT+ und Distanz-Bit");
const gl = C.feBuildPage(0x10, {elapsedMs:0, distM:0, speedMs:0, hr:null, cad:0, power:0, events:0, accPower:0, inUse:false});
ok(gl[6] === 0xFF && (gl[7] >> 4) === 2 && (gl[7] & 0x0F) === 0x04, "ohne Gurt HF ungültig, Zustand READY");
const sp = C.feBuildPage(0x19, {power:1234, cad:92, events:250, accPower:65000, inUse:true});
ok(sp[0] === 0x19 && sp[1] === 250 && sp[2] === 92, "Seite 0x19: Nummer, Ereigniszähler, Trittfrequenz");
ok((sp[3] | sp[4]<<8) === 65000, "kumulierte Leistung 16 Bit");
ok((sp[5] | (sp[6] & 0x0F)<<8) === 1234 && (sp[6] >> 4) === 0, "Leistung über 12 Bit, Trainer-Status 0");
const z = C.feBuildPage(0x19, {power:0, cad:0, events:0, accPower:0, inUse:false});
ok(z[2] === 0xFF && (z[7] >> 4) === 2, "Stillstand: Trittfrequenz ungültig, Zustand READY");
const fa = C.makeFeAccum();
fa(100); const a2 = fa(200);
ok(a2.events === 2 && a2.accPower === 300, "Ereigniszähler und Summe");
let last; for(let i=0;i<300;i++) last = fa(1000);
ok(last.events === ((302) & 0xFF) && last.accPower === ((300 + 300000) & 0xFFFF), "Überlauf 8 bzw. 16 Bit");

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

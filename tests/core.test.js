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

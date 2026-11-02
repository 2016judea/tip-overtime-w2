#!/usr/bin/env node
// End-to-end check against the SANDBOX merchant: the production pull (site/api/_clover.js) + the engine,
// with stated answers, compared to the figures worked out by hand from scripts/seed_sandbox.js.
const fs = require("fs"), path = require("path");
for (const l of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n")) { const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] = l.slice(i + 1); }
const { d1, accessToken } = require("../site/api/_lib");
const { pullYear, toEngineInput } = require("../site/api/_clover");
const { report } = require("../site/api/_engine");
const MID = "4ZNNY5AK5SNT1";
(async () => {
  const [row] = await d1("select * from merchants where merchant_id=?", [MID]);
  const t0 = Date.now();
  const raw = await pullYear(MID, await accessToken(row), 2026);
  const input = toEngineInput(raw, 2026);
  console.log(`pulled in ${Date.now() - t0} ms: tz ${input.business.tz}, ${input.employees.length} employees, ${input.shifts.length} shifts, ${input.payments.length} payments`);
  const id = (n) => input.employees.find((e) => e.name.startsWith(n)).id;
  const ans = { workweekStart: { weekday: 0, hour: 0 }, serviceChargesTo: "house", cashPaymentTipsInDeclarations: false, employees: {
    [id("Rosa")]: { status: "hourly", statusConfirmed: true, rates: [{ from: "2026-01-01", cents: 1500 }], ttoc: ["102"], ttocConfirmed: true, tipShareInCents: 0, tipShareOutCents: 0, otherPay: [] },
    [id("Marcus")]: { status: "hourly", statusConfirmed: true, rates: [{ from: "2026-01-01", cents: 1400 }], ttoc: ["101"], ttocConfirmed: true, tipShareInCents: 0, tipShareOutCents: 0, otherPay: [] },
    [id("Jo")]: { status: "hourly", statusConfirmed: true, rates: [{ from: "2026-01-01", cents: 2000 }], otherPay: [] },
  } };
  const r = report(input, ans);
  const want = { Rosa: { TP: 800 + 1200 + 300 + 1000 + 5 * 1500 + 4 * 1200, TT: 3750, sc: 3600, code: "102" },
    Marcus: { TP: 700 + 500 + 3 * 2500 + 3000 + 4 * 2000, TT: 2800, sc: 0, code: "101" },
    Jo: { TP: 0, TT: 14000, sc: 0, code: "" } };
  let bad = 0;
  for (const [n, w] of Object.entries(want)) {
    const e = r.employees.find((x) => x.name.startsWith(n));
    const got = { TP: e.boxes.TP, TT: e.boxes.TT, sc: e.tips.serviceChargesExcluded.totalCents, code: e.boxes["14b"].join(",") };
    const ok = JSON.stringify(got) === JSON.stringify(w);
    if (!ok) bad++;
    console.log(`${ok ? "OK  " : "FAIL"} ${n.padEnd(7)} TP ${got.TP} (want ${w.TP})  TT ${got.TT} (want ${w.TT})  service charge excluded ${got.sc}  14b ${got.code || "-"}  suggested ${input.employees.find((x) => x.name.startsWith(n)).suggestedTtoc}`);
  }
  const m = r.employees.find((x) => x.name.startsWith("Marcus"));
  console.log("Marcus weeks:", m.overtime.weeks.map((w) => `${w.label} ${w.hours}h ${w.flags.join("; ")}`).join(" | "));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(1); });

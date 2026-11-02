#!/usr/bin/env node
// Builds the SAMPLE on the landing page: a fictional café ("Larkspur Café", synthetic people, synthetic
// register) in exactly the shape the Clover mapper produces, Jan 1 – Oct 31 2026. Seeded, so the
// sample is byte-identical on every run.  node scripts/make_sample.js
const fs = require("fs");
const path = require("path");
const { zoned, report } = require("../site/api/_engine");

let seed = 20260131;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const TZ = "America/Chicago";
const H = 3600000;

const employees = [
  { id: "E1", name: "Dana Ruiz", role: "Server", suggestedTtoc: "102" },
  { id: "E2", name: "Theo Park", role: "Bartender", suggestedTtoc: "101" },
  { id: "E3", name: "Sam Okafor", role: "Line cook", suggestedTtoc: "105" },
  { id: "E4", name: "Lee Tran", role: "Barista", suggestedTtoc: "107" },
  { id: "E5", name: "Priya Shah", role: "General manager", suggestedTtoc: null },
];
// hours per day pattern per employee: [days per week options, hours per shift options]
const pattern = {
  E1: [[5, 5, 6], [7, 8, 8.5, 9]],
  E2: [[4, 5], [7, 8, 9, 10]],
  E3: [[5, 6, 6], [8, 9, 9.5, 10]],
  E4: [[4, 5], [6, 7, 8]],
  E5: [[5], [9, 10]],
};
const shifts = [], payments = [];
let sid = 0, pid = 0;
for (let week = 0; week < 44; week++) {
  const sun = new Date(Date.UTC(2025, 11, 28 + week * 7));
  for (const e of employees) {
    const [daysOpt, hrsOpt] = pattern[e.id];
    const days = pick(daysOpt);
    const startDow = Math.floor(rnd() * (7 - days + 1));
    for (let d = 0; d < days; d++) {
      const day = new Date(sun.getTime() + (startDow + d) * 86400000);
      const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, dd = day.getUTCDate();
      if (y !== 2026 || (m > 10)) continue;
      const startHour = e.id === "E2" ? 16 : e.id === "E3" ? 9 : 7;
      const a = zoned(TZ, y, m, dd, startHour) + Math.floor(rnd() * 4) * 15 * 60000;
      const len = pick(hrsOpt) * H;
      const tipped = ["E1", "E2", "E4"].includes(e.id);
      const s = { id: `S${++sid}`, employeeId: e.id, in: a, out: a + len, edited: rnd() < 0.02,
        declaredCashTips: tipped ? Math.round((e.id === "E2" ? 2200 : e.id === "E1" ? 1400 : 600) * (0.5 + rnd())) : 0 };
      shifts.push(s);
      if (!tipped) continue;
      const n = e.id === "E4" ? 6 : 4;
      for (let k = 0; k < n; k++) {
        const t = a + Math.floor(rnd() * len);
        const amount = e.id === "E4" ? 600 + Math.floor(rnd() * 900) : 2500 + Math.floor(rnd() * 9000);
        const cash = rnd() < 0.12;
        const tip = cash ? (rnd() < 0.5 ? Math.round(amount * 0.1) : 0) : Math.round(amount * (0.15 + rnd() * 0.07));
        const p = { id: `P${++pid}`, orderId: `O${pid}`, employeeId: e.id, createdTime: t, tender: cash ? "cash" : "card",
          tenderLabel: cash ? "Cash" : "Credit Card", tipCents: tip, refundedTipCents: 0, serviceChargeCents: 0, result: "SUCCESS" };
        if (e.id === "E1" && rnd() < 0.03) { p.serviceChargeCents = Math.round(amount * 2.5 * 0.18); p.serviceChargeName = "Party of 8+ (18%)"; p.tipCents = 0; }
        if (rnd() < 0.004) p.refundedTipCents = p.tipCents;
        if (rnd() < 0.003) p.result = "FAIL";
        payments.push(p);
      }
    }
  }
}
const input = { business: { name: "Larkspur Café (SAMPLE — fictional business)", tz: TZ, year: 2026, through: "2026-10-31" },
  employees, shifts, payments, source: "sample" };
const answers = {
  workweekStart: { weekday: 0, hour: 0 },
  serviceChargesTo: "house",
  cashPaymentTipsInDeclarations: false,
  employees: {
    E1: { status: "hourly", statusConfirmed: true, rates: [{ from: "2026-01-01", cents: 1200 }], ttoc: ["102"], ttocConfirmed: true, tipShareInCents: 0, tipShareOutCents: 61500, otherPay: [] },
    E2: { status: "hourly", statusConfirmed: true, rates: [{ from: "2026-01-01", cents: 1350 }], ttoc: ["101"], ttocConfirmed: true, tipShareInCents: 0, tipShareOutCents: 0, otherPay: [] },
    E3: { status: "hourly", statusConfirmed: true, rates: [{ from: "2026-01-01", cents: 1900 }, { from: "2026-07-01", cents: 2050 }], ttoc: ["105"], ttocConfirmed: true, tipShareInCents: 61500, tipShareOutCents: 0,
      otherPay: [{ from: "2026-04-01", to: "2026-06-30", cents: 30000, note: "Q2 kitchen inspection bonus" }] },
    E4: { status: "hourly", statusConfirmed: true, rates: [{ from: "2026-01-01", cents: 1500 }], ttoc: ["107"] },
    E5: { status: "exempt", statusConfirmed: true },
  },
};
const out = path.join(__dirname, "..", "site", "public", "sample");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "input.json"), JSON.stringify(input));
fs.writeFileSync(path.join(out, "answers.json"), JSON.stringify(answers, null, 1));
const r = report(input, answers);
console.log(`${shifts.length} shifts, ${payments.length} payments`);
for (const e of r.employees) console.log(e.name.padEnd(12), "TP", (e.boxes.TP / 100).toFixed(2).padStart(10), "TT", (e.boxes.TT / 100).toFixed(2).padStart(9), e.boxes["14b"].join(","), e.ready ? "ready" : `flags: ${e.flags.length}`);

// node --test tests/   — the IRS and DOL worked examples, plus the edges that cost an owner a W-2c.
const test = require("node:test");
const assert = require("node:assert/strict");
const { report, zoned, workweeks } = require("../site/api/_engine");

const TZ = "America/Chicago";
const H = 3600 * 1000;
const biz = { name: "Test Café", tz: TZ, year: 2026 };
// Monday 2026-03-02 is inside a Sunday-start week (Sun 3/1 – Sat 3/7).
function shiftsOn(empId, startDay, perDay, days, startHour = 8) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const a = zoned(TZ, 2026, 3, startDay + i, startHour);
    out.push({ id: `${empId}-s${startDay + i}`, employeeId: empId, in: a, out: a + perDay * H, declaredCashTips: 0 });
  }
  return out;
}
const run = (shifts, payments, empAns, extra = {}) =>
  report({ business: biz, employees: [{ id: "A", name: "Individual A" }], shifts, payments: payments || [] },
    { workweekStart: { weekday: 0, hour: 0 }, ...extra, employees: { A: empAns } });

test("FAQ Q16: $20/h, 50 hours, paid double time -> qualified OT is $100 (only the FLSA half)", () => {
  const r = run(shiftsOn("A", 2, 10, 5), [], { rates: [{ from: "2026-01-01", cents: 2000 }] });
  const e = r.employees[0];
  assert.equal(e.boxes.TT, 10000);
  const w = e.overtime.weeks.find((w) => w.hours > 0);
  assert.equal(w.hours, 50);
  assert.equal(w.regularRateCents, 2000);
  assert.equal(w.otHours, 10);
});

test("FAQ Q13: no averaging — 50 h one week and 30 h the next still gives 10 OT hours", () => {
  const s = [...shiftsOn("A", 2, 10, 5), ...shiftsOn("A", 9, 6, 5)];
  const r = run(s, [], { rates: [{ from: "2026-01-01", cents: 2000 }] });
  assert.equal(r.employees[0].boxes.TT, 10000);
});

test("Exactly 40 hours -> no qualified OT", () => {
  const r = run(shiftsOn("A", 2, 8, 5), [], { rates: [{ from: "2026-01-01", cents: 1800 }] });
  assert.equal(r.employees[0].boxes.TT, 0);
});

test("FS15: tip credit — OT on the full minimum wage, not the $2.13 cash wage", () => {
  // 45 h at $2.13 cash + $5.12 credit = $7.25 regular rate; 5 h × ½ × 7.25 = $18.125 -> $18.13
  const r = run(shiftsOn("A", 2, 9, 5), [], { rates: [{ from: "2026-01-01", cents: 213 }], tipCreditCents: 512 });
  assert.equal(r.employees[0].boxes.TT, 1813);
});

test("FS15/Q15: tips never enter the regular rate", () => {
  const pay = [{ id: "p1", employeeId: "A", createdTime: zoned(TZ, 2026, 3, 3, 12), tender: "card", tipCents: 50000, result: "SUCCESS" }];
  const r = run(shiftsOn("A", 2, 10, 5), pay, { rates: [{ from: "2026-01-01", cents: 2000 }] });
  assert.equal(r.employees[0].boxes.TT, 10000);
  assert.equal(r.employees[0].boxes.TP, 50000);
});

test("FS56A: a non-discretionary bonus raises the regular rate", () => {
  // 50 h × $20 = $1,000 + $100 bonus = $1,100 / 50 = $22.00; 10 × ½ × 22 = $110
  const r = run(shiftsOn("A", 2, 10, 5), [], { rates: [{ from: "2026-01-01", cents: 2000 }], otherPay: [{ date: "2026-03-04", cents: 10000, note: "attendance bonus" }] });
  assert.equal(r.employees[0].boxes.TT, 11000);
});

test("FS15: service charges paid out to staff are wages in the regular rate, never tips", () => {
  const pay = [{ id: "p1", employeeId: "A", createdTime: zoned(TZ, 2026, 3, 3, 12), tender: "card", tipCents: 1000, serviceChargeCents: 5000, serviceChargeName: "Large party 18%", result: "SUCCESS" }];
  const kept = run(shiftsOn("A", 2, 10, 5), pay, { rates: [{ from: "2026-01-01", cents: 2000 }] });
  assert.equal(kept.employees[0].boxes.TP, 1000);
  assert.equal(kept.employees[0].tips.serviceChargesExcluded.totalCents, 5000);
  assert.equal(kept.employees[0].boxes.TT, 10000);
  const paid = run(shiftsOn("A", 2, 10, 5), pay, { rates: [{ from: "2026-01-01", cents: 2000 }] }, { serviceChargesTo: "server" });
  assert.equal(paid.employees[0].boxes.TP, 1000); // still not a tip
  assert.equal(paid.employees[0].boxes.TT, 10500); // (1000+50)/50 = 21; 10 × ½ × 21 = 105
});

test("A shift across the workweek boundary is split at it", () => {
  // Sat 3/7 18:00 -> Sun 3/8 04:00: 6 h in week 1, 4 h in week 2
  const a = zoned(TZ, 2026, 3, 7, 18);
  const s = [...shiftsOn("A", 2, 8.5, 5), { id: "x", employeeId: "A", in: a, out: a + 10 * H }];
  const r = run(s, [], { rates: [{ from: "2026-01-01", cents: 2000 }] });
  const w1 = r.employees[0].overtime.weeks.find((w) => w.label.startsWith("2026-03-01"));
  assert.equal(w1.hours, 48.5);
  assert.equal(r.employees[0].boxes.TT, round2(8.5 * 0.5 * 2000));
  assert.ok(w1.flags.some((f) => /split/.test(f)));
});
const round2 = (x) => Math.round(x);

test("Workweek start day is the owner's: a Wednesday start moves the hours", () => {
  // Mon–Fri 10 h: Sunday start -> one 50 h week; Wednesday start -> 20 h + 30 h, no OT
  const s = shiftsOn("A", 2, 10, 5);
  const sun = run(s, [], { rates: [{ from: "2026-01-01", cents: 2000 }] });
  const wed = run(s, [], { rates: [{ from: "2026-01-01", cents: 2000 }] }, { workweekStart: { weekday: 3, hour: 0 } });
  assert.equal(sun.employees[0].boxes.TT, 10000);
  assert.equal(wed.employees[0].boxes.TT, 0);
});

test("Exempt staff get no TT", () => {
  const r = run(shiftsOn("A", 2, 12, 5), [], { status: "exempt", statusConfirmed: true });
  assert.equal(r.employees[0].boxes.TT, 0);
});

test("Salaried non-exempt: $800 for 40 h, worked 45 -> rate $20, TT $50", () => {
  const r = run(shiftsOn("A", 2, 9, 5), [], { status: "salaried", weeklySalaryCents: 80000, salaryHours: 40 });
  assert.equal(r.employees[0].boxes.TT, 5000);
});

test("Rate change mid-week: blended regular rate", () => {
  // 3/2–3/3 at $20 (20 h), 3/4–3/6 at $23 (30 h): (400+690)/50 = 21.80; 10 × ½ × 21.80 = 109
  const r = run(shiftsOn("A", 2, 10, 5), [], { rates: [{ from: "2026-01-01", cents: 2000 }, { from: "2026-03-04", cents: 2300 }] });
  assert.equal(r.employees[0].boxes.TT, 10900);
});

test("TP: charged + cash-tender + declared + shared in − shared out; refunds and failed payments out", () => {
  const t = zoned(TZ, 2026, 3, 3, 12);
  const pay = [
    { id: "p1", employeeId: "A", createdTime: t, tender: "card", tipCents: 2000, result: "SUCCESS" },
    { id: "p2", employeeId: "A", createdTime: t, tender: "card", tipCents: 1500, refundedTipCents: 1500, result: "SUCCESS" },
    { id: "p3", employeeId: "A", createdTime: t, tender: "card", tipCents: 9999, result: "FAIL" },
    { id: "p4", employeeId: "A", createdTime: t, tender: "cash", tipCents: 300, result: "SUCCESS" },
    { id: "p5", employeeId: "A", createdTime: zoned(TZ, 2025, 12, 31, 12), tender: "card", tipCents: 700, result: "SUCCESS" },
  ];
  const s = shiftsOn("A", 2, 8, 1); s[0].declaredCashTips = 4000;
  const r = run(s, pay, { tipShareInCents: 1000, tipShareOutCents: 500, ttoc: ["102"], ttocConfirmed: true });
  const tips = r.employees[0].tips;
  assert.equal(tips.cardCents, 2000);
  assert.equal(tips.cashTenderCents, 300);
  assert.equal(tips.declaredCents, 4000);
  assert.equal(r.employees[0].boxes.TP, 2000 + 300 + 4000 + 1000 - 500);
  const once = run(s, pay, { ttoc: ["102"] }, { cashPaymentTipsInDeclarations: true });
  assert.equal(once.employees[0].boxes.TP, 2000 + 4000);
});

test("Box 14b: up to two codes; any nonqualifying tips force 000 in", () => {
  const pay = [{ id: "p1", employeeId: "A", createdTime: zoned(TZ, 2026, 3, 3, 12), tender: "card", tipCents: 100, result: "SUCCESS" }];
  assert.deepEqual(run([], pay, { ttoc: ["102", "101", "104"] }).employees[0].boxes["14b"], ["102", "101"]);
  assert.deepEqual(run([], pay, { ttoc: ["102", "101"], nonqualifyingTips: true }).employees[0].boxes["14b"], ["102", "000"]);
  assert.deepEqual(run([], [], { ttoc: ["102"] }).employees[0].boxes["14b"], []);
});

test("Unknowns are flagged, never silently guessed", () => {
  const pay = [{ id: "p1", employeeId: "A", createdTime: zoned(TZ, 2026, 3, 3, 12), tender: "card", tipCents: 100, result: "SUCCESS" }];
  const r = report({ business: biz, employees: [{ id: "A", name: "A" }], shifts: shiftsOn("A", 2, 10, 5), payments: pay }, {});
  const f = r.employees[0].flags.join(" | ");
  assert.match(f, /No hourly rate/);
  assert.match(f, /occupation code not confirmed/);
  assert.match(f, /Pay type assumed/);
  assert.ok(r.assumptions.every((a) => a.answered === false));
  assert.equal(r.employees[0].ready, false);
});

test("Workweeks are fixed 168 h windows covering the year, the first containing Jan 1", () => {
  const ws = workweeks(TZ, 2026, 0, 0);
  for (let i = 1; i < ws.length; i++) assert.equal(ws[i].start - ws[i - 1].start, 168 * H);
  assert.ok(ws[0].start <= zoned(TZ, 2026, 1, 1, 0) && ws[0].end > zoned(TZ, 2026, 1, 1, 0));
  assert.equal(ws[0].label.slice(0, 10), "2025-12-28");
});

test("A workweek ending in the next year is not counted in this year's TT", () => {
  // Week of Sun 2026-12-27 ends Sat 2027-01-02
  const a = zoned(TZ, 2026, 12, 28, 8);
  const s = [0, 1, 2, 3, 4].map((i) => ({ id: `d${i}`, employeeId: "A", in: a + i * 24 * H, out: a + i * 24 * H + 10 * H }));
  const r = run(s, [], { rates: [{ from: "2026-01-01", cents: 2000 }] });
  assert.equal(r.employees[0].boxes.TT, 0);
  assert.ok(r.employees[0].overtime.weeks[0].flags.some((f) => /outside the tax year/.test(f)));
});

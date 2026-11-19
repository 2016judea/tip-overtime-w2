// The worker's deduction (site/api/_deduction.js) against the worked examples in the regulation,
// the IRS notice and the form's own rounding instruction. Dollar figures here are the sources' own.
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../site/api/_deduction.js");
const { TTOC } = require("../site/api/_ttoc.js");

const run = (x) => D.compute({ tax_year: 2026, _ttoc: TTOC, ...x });
const $ = (cents) => cents / 100;

test("26 CFR 1.224-1(b)(3) Example 1: $26,000 tips, single, MAGI $200,000 -> $20,000", () => {
  const r = run({ filing_status: "single", magi: 200000, jobs: [{ box12_tp: 26000, box14b: "101" }] });
  assert.equal($(r.tips.capped_cents), 25000);
  assert.equal(r.tips.phase_out.steps, 50);
  assert.equal($(r.tips.deduction_cents), 20000);
});

test("26 CFR 1.224-1(b)(3) Example 2: $10,000 tips, single, MAGI $180,000 -> $7,000", () => {
  const r = run({ filing_status: "single", magi: 180000, jobs: [{ box12_tp: 10000 }] });
  assert.equal($(r.tips.deduction_cents), 7000);
});

test("26 CFR 1.224-1(b)(3) Example 3: spouses $15,000 + $20,000, joint, MAGI $200,000 -> $25,000 (cap is per return)", () => {
  const r = run({ filing_status: "mfj", magi: 200000, jobs: [{ box12_tp: 15000 }, { box12_tp: 20000 }] });
  assert.equal($(r.tips.deduction_cents), 25000);
  assert.equal(r.tips.phase_out.cut, 0);
});

test("Schedule 1-A line 13: whole thousands rounded DOWN ($150,999 cuts nothing, $151,000 cuts $100)", () => {
  assert.equal($(run({ filing_status: "single", magi: 150999, jobs: [{ box12_tp: 10000 }] }).tips.deduction_cents), 10000);
  assert.equal($(run({ filing_status: "single", magi: 151000, jobs: [{ box12_tp: 10000 }] }).tips.deduction_cents), 9900);
  assert.equal($(run({ filing_status: "single", magi: 151999.99, jobs: [{ box12_tp: 10000 }] }).tips.deduction_cents), 9900);
  assert.equal($(run({ filing_status: "single", magi: 400000, jobs: [{ box12_tp: 10000 }] }).tips.deduction_cents), 0);
});

test("§225(b): overtime cap $12,500, or $25,000 on a joint return; same phase-out", () => {
  assert.equal($(run({ filing_status: "single", magi: 90000, jobs: [{ box12_tt: 14000 }] }).overtime.deduction_cents), 12500);
  assert.equal($(run({ filing_status: "hoh", magi: 90000, jobs: [{ box12_tt: 14000 }] }).overtime.deduction_cents), 12500);
  assert.equal($(run({ filing_status: "mfj", magi: 90000, jobs: [{ box12_tt: 14000 }, { box12_tt: 14000 }] }).overtime.deduction_cents), 25000);
  assert.equal($(run({ filing_status: "mfj", magi: 310500, jobs: [{ box12_tt: 5000 }] }).overtime.deduction_cents), 4000);
});

test("§224(f), §225(e): married filing separately gets nothing; §224(e): no valid SSN gets nothing", () => {
  const m = run({ filing_status: "mfs", magi: 40000, jobs: [{ box12_tp: 8000, box12_tt: 2000 }] });
  assert.equal(m.total_cents, 0);
  assert.ok(m.flags.some((f) => f.level === "stop" && f.src === "IRC224_MFJ"));
  assert.equal(run({ filing_status: "single", valid_ssn: false, magi: 40000, jobs: [{ box12_tp: 8000 }] }).total_cents, 0);
});

test("§224(h): no deduction after 2028", () => {
  assert.equal(D.compute({ tax_year: 2029, filing_status: "single", magi: 40000, jobs: [{ box12_tp: 8000 }] }).total_cents, 0);
});

test("Notice 2025-69 overtime Examples 1-4: every method lands on the $5,000 FLSA premium", () => {
  const ot = (j) => $(run({ filing_status: "single", magi: 60000, jobs: [j] }).overtime.deduction_cents);
  assert.equal(ot({ ot_premium_paid: 5000 }), 5000); // Ex 1: premium stated, 1.5x
  assert.equal(ot({ ot_pay_total: 15000 }), 5000); // Ex 2: total at 1.5x, / 3
  assert.equal(ot({ ot_premium_paid: 10000, ot_multiplier: 2 }), 5000); // Ex 3: premium at 2x, / 2
  assert.equal(ot({ ot_pay_total: 20000, ot_multiplier: 2 }), 5000); // Ex 4: total at 2x, / 4
});

test("Hours over 40 x 0.5 x regular rate (§225(c)(1)); FLSA-exempt counts nothing; box 12 TT wins over estimates", () => {
  const r = run({ filing_status: "single", magi: 50000, jobs: [{ ot_hours_over_40: 100, regular_rate: 20 }] });
  assert.equal($(r.overtime.deduction_cents), 1000);
  assert.equal(run({ filing_status: "single", magi: 50000, jobs: [{ ot_hours_over_40: 100, regular_rate: 20, flsa_exempt: true }] }).overtime.deduction_cents, 0);
  assert.equal($(run({ filing_status: "single", magi: 50000, jobs: [{ box12_tt: 750, ot_hours_over_40: 100, regular_rate: 20 }] }).overtime.deduction_cents), 750);
});

test("2026 Schedule 1-A line 4 col (v): the larger of box 12 TP and Form 4137 line 1 col (c), per employer", () => {
  const r = run({ filing_status: "single", magi: 50000, jobs: [{ box12_tp: 9000, form4137_tips: 11000 }, { box12_tp: 3000 }] });
  assert.equal($(r.tips.qualified_cents), 14000);
});

test("box 14b 000: the unlisted part comes off, and without it the worker is asked", () => {
  const asked = run({ filing_status: "single", magi: 50000, jobs: [{ box12_tp: 9000, box14b: "102 000" }] });
  assert.ok(asked.flags.some((f) => f.level === "ask" && f.src === "W2_14B"));
  const r = run({ filing_status: "single", magi: 50000, jobs: [{ box12_tp: 9000, box14b: "102 000", nonqualified_tips: 2000 }] });
  assert.equal($(r.tips.deduction_cents), 7000);
});

test("§224(c): self-employed tips count only up to profit less other allocable deductions", () => {
  const r = run({ filing_status: "single", magi: 50000, self_employed: [{ tips_1099: 7000, net_profit: 5000, other_deductions: 1000 }] });
  assert.equal($(r.tips.deduction_cents), 4000);
});

test("Tax saved (2026 tables, standard deduction): $30,000 pay, $8,000 tips, single -> $830", () => {
  const r = run({ filing_status: "single", magi: 30000, agi: 30000, jobs: [{ box12_tp: 8000 }] });
  // taxable 30,000 - 16,100 = 13,900 -> 1,240 + 12% x 1,500 = 1,420; after 5,900 -> 590
  assert.equal($(r.saved.cents), 830);
});

test("worth(): median bartender (OEWS May 2025, $34,340), single -> $120 per $1,000 of tips, at most $1,941", () => {
  const w = D.worth(34340, "single");
  assert.equal(w.per1000, 120);
  assert.equal(w.most, 1941);
  assert.deepEqual(D.worth(15000, "single"), { taxable: 0, per1000: 0, most: 0, taxBefore: 0 });
});

test("2026 lines: line 15 and line 27 carry the two deductions", () => {
  const r = run({ filing_status: "single", magi: 50000, jobs: [{ box12_tp: 6000, box12_tt: 1200 }] });
  assert.equal(r.lines.find((l) => l.line === "15").cents, 600000);
  assert.equal(r.lines.find((l) => l.line === "27").cents, 120000);
  assert.match(r.form1040, /line 13a/);
});

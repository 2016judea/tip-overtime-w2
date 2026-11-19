// Payroll rows -> the register engine (site/api/_engine.js), so a bookkeeper who pastes a table gets
// TP, TT and box 14b from the same tested math the Clover report uses. One row = one employee in one
// FLSA workweek: hours worked, regular hourly rate, tips reported, and anything else that enters the
// regular rate. Each row becomes one shift inside its own workweek (the engine needs only the hours
// per week, never the clock times) and one tip payment, in UTC so no DST hour moves a boundary.
const E = require("./_engine.js");
const { TTOC, suggestTtoc } = require("./_ttoc.js");

const DAY = 86400000;
const num = (v) => (v === undefined || v === null || v === "" ? null : Number(String(v).replace(/[$,\s]/g, "")));
const cents = (v) => { const n = num(v); return n === null || Number.isNaN(n) ? 0 : Math.round(n * 100); };

// A pasted CSV or tab table with a header row. Recognised headers (case and spacing ignored):
// employee, week_start (or week), hours, rate, tips, tip_credit, other_pay, service_charges, role, ttoc, exempt
const ALIASES = { employee: ["employee", "name", "worker", "staff"], week_start: ["week_start", "week", "weekstart", "week_of", "workweek"],
  hours: ["hours", "hours_worked", "hrs"], rate: ["rate", "hourly_rate", "regular_rate", "pay_rate", "wage"], tips: ["tips", "tips_reported", "reported_tips", "cash_tips"],
  tip_credit: ["tip_credit"], other_pay: ["other_pay", "bonus", "bonuses"], service_charges: ["service_charges", "service_charge", "service_charges_paid"],
  role: ["role", "job", "title", "position"], ttoc: ["ttoc", "occupation_code", "box14b", "14b"], exempt: ["exempt", "flsa_exempt"] };
function parseTable(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const split = (l) => l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
  const head = split(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  const key = head.map((h) => Object.keys(ALIASES).find((k) => ALIASES[k].includes(h)) || null);
  return lines.slice(1).map((l) => { const v = split(l), o = {}; key.forEach((k, i) => { if (k) o[k] = v[i]; }); return o; });
}

function boxes(args) {
  const year = Number(args.tax_year) || 2026;
  const rows = Array.isArray(args.rows) && args.rows.length ? args.rows : parseTable(args.table || args.csv);
  if (!rows.length) return { ok: false, error: "No rows. Pass rows (one per employee per workweek) or a pasted table with a header: employee, week_start, hours, rate, tips." };
  const problems = [];
  const starts = rows.map((r, i) => {
    const d = String(r.week_start || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) problems.push(`Row ${i + 1}: week_start must be a date like ${year}-03-01`);
    const h = num(r.hours);
    if (h === null || Number.isNaN(h) || h < 0 || h > 168) problems.push(`Row ${i + 1}: hours must be 0 to 168 for one workweek`);
    if (!r.employee) problems.push(`Row ${i + 1}: employee is empty`);
    return d;
  });
  if (problems.length) return { ok: false, error: problems.slice(0, 8).join("; ") };
  const dows = new Set(starts.map((d) => new Date(d + "T00:00:00Z").getUTCDay()));
  if (dows.size > 1) return { ok: false, error: "Every week_start must fall on the same weekday: the FLSA workweek is fixed and recurring (IRS FS-2026-13 Q13)." };
  const weekday = [...dows][0];

  const ids = new Map();
  const input = { business: { tz: "UTC", year }, employees: [], shifts: [], payments: [], source: "payroll rows" };
  const answers = { workweekStart: { weekday, hour: 0 }, cashPaymentTipsInDeclarations: false, serviceChargesTo: "house", employees: {} };
  rows.forEach((r, i) => {
    const name = String(r.employee).slice(0, 60);
    if (!ids.has(name)) {
      const id = "e" + (ids.size + 1);
      ids.set(name, id);
      input.employees.push({ id, name, role: r.role || "" });
      const code = r.ttoc && TTOC[String(r.ttoc).trim()] ? String(r.ttoc).trim() : null;
      const sug = code || suggestTtoc(r.role || "");
      answers.employees[id] = { status: /^(y|yes|true|1)$/i.test(String(r.exempt || "")) ? "exempt" : "hourly", statusConfirmed: true,
        rates: [], otherPay: [], tipShareInCents: 0, tipShareOutCents: 0, tipCreditCents: 0,
        ttoc: sug ? [sug] : [], ttocConfirmed: !!code, ttocSuggested: code ? null : sug };
    }
    const id = ids.get(name), a = answers.employees[id];
    const t0 = Date.parse(starts[i] + "T00:00:00Z");
    const h = num(r.hours);
    if (h > 0) input.shifts.push({ id: "s" + i, employeeId: id, in: t0, out: t0 + Math.round(h * 3600000) });
    a.rates.push({ from: starts[i], cents: cents(r.rate) });
    if (cents(r.tip_credit)) a.tipCreditCents = cents(r.tip_credit);
    if (cents(r.other_pay)) a.otherPay.push({ date: starts[i], cents: cents(r.other_pay), note: "other pay in the regular rate" });
    if (cents(r.service_charges)) a.otherPay.push({ date: starts[i], cents: cents(r.service_charges), note: "service charges paid out (wages, never tips)" });
    const tip = cents(r.tips);
    if (tip) input.payments.push({ id: "p" + i, employeeId: id, createdTime: t0 + 60000, tipCents: tip, tender: "card", tenderLabel: "tips reported for the week", result: "SUCCESS" });
  });
  const rep = E.report(input, answers);
  const employees = rep.employees.map((e) => {
    const a = answers.employees[e.id];
    const ot = e.overtime.weeks.filter((w) => w.otHours > 0).map((w) => ({ week: w.label, hours: w.hours, regular_rate: +(w.regularRateCents / 100).toFixed(4),
      qualified_ot: w.qualifiedOtCents / 100, math: `${w.otHours.toFixed(2)} h over 40 x 0.5 x $${(w.regularRateCents / 100).toFixed(4)}`, counted: w.inYear, flags: w.flags.filter((f) => !/manager|crosses/.test(f)) }));
    const flags = [];
    if (e.boxes.TP > 0 && !a.ttocConfirmed) flags.push(a.ttocSuggested ? `Box 14b ${a.ttocSuggested} (${TTOC[a.ttocSuggested]}) is a suggestion from the role "${e.role}": confirm it.` : "No occupation code: pass ttoc or role. Box 14b is required whenever box 12 TP has an amount.");
    if (rows.some((r) => r.employee === e.name && starts[rows.indexOf(r)].slice(0, 4) !== String(year))) flags.push("A week starts outside the tax year: its tips are counted in the year the week starts; check the pay date.");
    return { employee: e.name, box12_TP: e.boxes.TP / 100, box12_TT: e.boxes.TT / 100, box14b: e.boxes["14b"], box14b_title: e.boxes["14b"].map((k) => TTOC[k] || ""),
      status: e.status, weeks_with_overtime: ot, flags };
  });
  return { ok: true, tax_year: year, workweek_starts: E.WEEKDAYS[weekday] + " 00:00", employees,
    totals: { box12_TP: rep.totals.TP / 100, box12_TT: rep.totals.TT / 100 } };
}

module.exports = { boxes, parseTable };

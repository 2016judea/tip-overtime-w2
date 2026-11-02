// The calculator. Pure, deterministic, no network, no model: register rows + the owner's answers in,
// the three 2026 Form W-2 figures out, with every row that produced them.
//
// Sources (read 2026-11-02; cited where each rule is applied below):
//   [W2]   IRS, 2026 General Instructions for Forms W-2 and W-3 — https://www.irs.gov/instructions/iw2w3
//          Box 12 code TP, code TT; Box 14b.
//   [FAQ]  IRS FS-2026-13, overtime FAQ — https://www.irs.gov/pub/taxpros/fs-2026-13.pdf  (Q10–Q17)
//   [TIPS] IRS list of tipped occupations — https://www.irs.gov/tippedoccupations
//   [FS15] DOL WHD Fact Sheet #15, tipped employees — https://www.dol.gov/agencies/whd/fact-sheets/15-tipped-employees-flsa
//   [FS23] DOL WHD Fact Sheet #23, overtime — https://www.dol.gov/agencies/whd/fact-sheets/23-flsa-overtime-pay
//   [FS56A] DOL WHD Fact Sheet #56A, regular rate — https://www.dol.gov/agencies/whd/fact-sheets/56a-regular-rate
//
// Money is integer cents in and out. Inside a workweek the arithmetic is floating point and the
// week's qualified overtime is rounded to the cent once; TT is the sum of those rounded weeks.

const HOUR = 3600 * 1000;
const WEEK = 168 * HOUR; // [FAQ Q13] "a fixed and regularly recurring period of 168 hours"
const OT_THRESHOLD_H = 40; // [FS23] hours over 40 in a workweek
const FED_MIN_WAGE_C = 725; // [FS15] $7.25
const MAX_TIP_CREDIT_C = 512; // [FS15] "The maximum tip credit that an employer can currently claim is $5.12 per hour."
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const round = (x) => Math.round(x + 1e-9); // half-up on cents, stable against float dust

// ---- time zones (the register stamps UTC ms; workweeks and dates are the business's local clock)
function tzParts(tz, t) {
  const p = {};
  for (const { type, value } of new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
  }).formatToParts(new Date(t))) p[type] = value;
  return p;
}
function tzOffset(tz, t) {
  const p = tzParts(tz, t);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}
function zoned(tz, y, m, d, h = 0) { // local wall time -> UTC ms
  const guess = Date.UTC(y, m - 1, d, h);
  let t = guess - tzOffset(tz, guess);
  const off2 = tzOffset(tz, t);
  if (guess - off2 !== t) t = guess - off2;
  return t;
}
function localDate(tz, t) { const p = tzParts(tz, t); return `${p.year}-${p.month}-${p.day}`; }
function localStamp(tz, t) { const p = tzParts(tz, t); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`; }

// ---- workweeks [FAQ Q13]: fixed 168 h windows from the owner's chosen start, no averaging.
// The first window is the one containing Jan 1 local midnight. Stepping exactly 168 h means a
// boundary set at local midnight reads 01:00 or 23:00 after a DST change; that is the literal rule.
function workweeks(tz, year, startWeekday, startHour) {
  const jan1 = zoned(tz, year, 1, 1, 0);
  const jan1Dow = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  let back = (jan1Dow - startWeekday + 7) % 7;
  let anchor = zoned(tz, year, 1, 1 - back, startHour);
  if (anchor > jan1) anchor = zoned(tz, year, 1, 1 - back - 7, startHour);
  const end = zoned(tz, year + 1, 1, 1, 0);
  const weeks = [];
  for (let s = anchor; s < end; s += WEEK) {
    const e = s + WEEK;
    const endDate = localDate(tz, e - 1);
    weeks.push({ start: s, end: e, label: `${localDate(tz, s)} → ${endDate}`, endDate,
      inYear: endDate.slice(0, 4) === String(year) });
  }
  return weeks;
}

function rateOn(rates, date) { // rates: [{from:'YYYY-MM-DD', cents}], the latest from <= date wins
  let r = null;
  for (const x of [...(rates || [])].sort((a, b) => a.from.localeCompare(b.from))) if (x.from <= date) r = x;
  return r || (rates && rates.length ? [...rates].sort((a, b) => a.from.localeCompare(b.from))[0] : null);
}

// ---- tips: Box 12 code TP [W2] = "total amount of cash tips reported to the employer".
// "Cash tips" = cash + charged tips + tips received through tip-sharing [W2, "Deduction for qualified
// tips"]; "Mandatory service charges added to the bill are not qualified tips" [W2] and are not tips
// at all under the FLSA [FS15] — excluded from TP and listed separately.
function tipsFor(emp, input, ans) {
  const { year, tz } = input.business;
  const inYear = (t) => localDate(tz, t).slice(0, 4) === String(year);
  const rows = [];
  let card = 0, cashTender = 0, declared = 0, refunded = 0;
  const excluded = [];
  for (const p of input.payments) {
    if (p.employeeId !== emp.id || !inYear(p.createdTime)) continue;
    if (p.serviceChargeCents) excluded.push({ paymentId: p.id, orderId: p.orderId, when: localStamp(tz, p.createdTime), name: p.serviceChargeName || "Service charge", cents: p.serviceChargeCents });
    if (String(p.result || "SUCCESS").toUpperCase() !== "SUCCESS") continue;
    const tip = p.tipCents || 0;
    const back = p.refundedTipCents || 0;
    if (!tip && !back) continue;
    const isCash = p.tender === "cash";
    const counted = isCash && ans.cashPaymentTipsInDeclarations ? 0 : tip - back;
    if (isCash) cashTender += counted; else card += counted;
    refunded += back;
    rows.push({ kind: isCash ? "cash tip rung on a cash payment" : `charged tip (${p.tenderLabel || "card"})`,
      paymentId: p.id, orderId: p.orderId, when: localStamp(tz, p.createdTime), tipCents: tip, refundedTipCents: back,
      countedCents: counted, note: isCash && ans.cashPaymentTipsInDeclarations ? "already inside the clock-out declaration (your answer)" : undefined });
  }
  for (const s of input.shifts) {
    if (s.employeeId !== emp.id || !s.declaredCashTips) continue;
    const t = s.out || s.in;
    if (!inYear(t)) continue;
    declared += s.declaredCashTips;
    rows.push({ kind: "cash tips declared at clock-out", shiftId: s.id, when: localStamp(tz, t), countedCents: s.declaredCashTips });
  }
  const e = ans.employees[emp.id] || {};
  const shareIn = e.tipShareInCents || 0, shareOut = e.tipShareOutCents || 0;
  if (shareIn) rows.push({ kind: "tips shared IN to this employee outside Clover (your answer)", countedCents: shareIn });
  if (shareOut) rows.push({ kind: "tips shared OUT by this employee outside Clover (your answer)", countedCents: -shareOut });
  const total = card + cashTender + declared + shareIn - shareOut;
  return { cardCents: card, cashTenderCents: cashTender, declaredCents: declared, refundedCents: refunded,
    shareInCents: shareIn, shareOutCents: shareOut, totalCents: total, rows,
    serviceChargesExcluded: { totalCents: excluded.reduce((a, x) => a + x.cents, 0), rows: excluded } };
}

// ---- overtime: Box 12 code TT [W2] = qualified overtime compensation, per workweek [FAQ Q12]:
//   FLSA hours over 40 × ½ × FLSA regular rate.
// Regular rate = all remuneration for employment in the week (minus statutory exclusions) ÷ hours
// worked [FAQ Q15, FS56A]. Tips are not remuneration from the employer and stay out; with a tip credit
// the rate is figured on cash wage + tip credit, i.e. the full minimum wage [FS15]. Service-charge money
// paid out to staff is wages and goes in [FS15]. Premiums beyond the FLSA (double time, daily OT) are
// never counted: only the FLSA-required half qualifies [FAQ Q16].
function overtimeFor(emp, input, ans, weeks) {
  const { tz } = input.business;
  const e = ans.employees[emp.id] || {};
  const status = e.status || "hourly";
  const flags = [];
  const out = [];
  if (status === "exempt") return { status, weeks: [], totalCents: 0, flags: [] };

  const segs = []; // shift pieces split at workweek boundaries
  for (const s of input.shifts) {
    if (s.employeeId !== emp.id) continue;
    if (!s.in || !s.out) { flags.push(`Shift ${s.id} has no clock-out and is left out of hours.`); continue; }
    if (s.out <= s.in) { flags.push(`Shift ${s.id} ends before it starts and is left out of hours.`); continue; }
    for (const w of weeks) {
      const a = Math.max(s.in, w.start), b = Math.min(s.out, w.end);
      if (b > a) segs.push({ shiftId: s.id, week: w, a, b, edited: s.edited, split: a !== s.in || b !== s.out });
    }
  }
  const scByWeek = new Map();
  if (ans.serviceChargesTo === "server") for (const p of input.payments) {
    if (p.employeeId !== emp.id || !p.serviceChargeCents) continue;
    if (String(p.result || "SUCCESS").toUpperCase() !== "SUCCESS") continue;
    const w = weeks.find((w) => p.createdTime >= w.start && p.createdTime < w.end);
    if (w) scByWeek.set(w.start, (scByWeek.get(w.start) || 0) + p.serviceChargeCents);
  }

  for (const w of weeks) {
    const mine = segs.filter((x) => x.week === w);
    const hoursMs = mine.reduce((a, x) => a + (x.b - x.a), 0);
    if (!hoursMs) continue;
    const hours = hoursMs / HOUR;
    let straight = 0; // cents of remuneration for the week that enters the regular rate
    const parts = [];
    if (status === "salaried") {
      const sal = e.weeklySalaryCents || 0, covers = e.salaryHours || 40;
      // [FS56A] a salary for a fixed workweek: regular rate = salary ÷ the hours it is meant to cover.
      // Carried as (salary ÷ covered hours) × hours worked so the week's rate below equals salary ÷ covers.
      const c = sal / covers * hours;
      straight += c;
      parts.push({ what: `${hours.toFixed(2)} h × $${(sal / covers / 100).toFixed(4)} (weekly salary $${(sal / 100).toFixed(2)} ÷ ${covers} h)`, cents: c });
    } else {
      const byRate = new Map();
      for (const x of mine) {
        const r = rateOn(e.rates, localDate(tz, x.a));
        const cash = r ? r.cents : 0;
        const credit = Math.min(e.tipCreditCents || 0, MAX_TIP_CREDIT_C);
        const per = cash + credit;
        const k = `${cash}|${credit}`;
        const cur = byRate.get(k) || { cash, credit, per, ms: 0 };
        cur.ms += x.b - x.a; byRate.set(k, cur);
      }
      for (const v of byRate.values()) {
        const c = v.per * v.ms / HOUR;
        straight += c;
        parts.push({ what: `${(v.ms / HOUR).toFixed(2)} h × $${(v.cash / 100).toFixed(2)}${v.credit ? ` + $${(v.credit / 100).toFixed(2)} tip credit` : ""}`, cents: c });
      }
    }
    for (const o of e.otherPay || []) { // non-discretionary bonus, shift differential, commission [FS56A]
      const amt = allocate(o, w, segs, tz);
      if (amt) { straight += amt; parts.push({ what: `other pay: ${o.note || "bonus"}`, cents: amt }); }
    }
    const sc = scByWeek.get(w.start) || 0;
    if (sc) { straight += sc; parts.push({ what: "service charges paid to this employee (your answer)", cents: sc }); }

    const rr = straight / hours; // cents per hour
    const otH = Math.max(0, hours - OT_THRESHOLD_H);
    const qot = otH > 0 ? round(otH * 0.5 * rr) : 0;
    const wflags = [];
    if (status !== "salaried" && !(e.rates && e.rates.length)) wflags.push("no pay rate entered");
    if (status !== "salaried" && rr < FED_MIN_WAGE_C - 1e-6) wflags.push(`regular rate under the $7.25 federal minimum: if you take a tip credit, enter it`);
    if (!w.inYear) wflags.push("this workweek ends outside the tax year and is not counted");
    if (w.start < zoned(tz, input.business.year, 1, 1, 0)) wflags.push("workweek starts in the prior year: counted here because it ends in this year; check it was paid in this year");
    if (w.end > zoned(tz, input.business.year + 1, 1, 1, 0) - WEEK && w.inYear) wflags.push("last workweek of the year: if it was paid in January, it belongs on next year's W-2");
    if (mine.some((x) => x.edited)) wflags.push("a clock time in this week was edited by a manager");
    if (mine.some((x) => x.split)) wflags.push("a shift crosses the workweek boundary and is split at it");
    out.push({ label: w.label, start: w.start, inYear: w.inYear, hours: +hours.toFixed(4), straightCents: +straight.toFixed(4), parts,
      regularRateCents: +rr.toFixed(4), otHours: +otH.toFixed(4), qualifiedOtCents: qot, flags: wflags,
      shifts: mine.map((x) => ({ shiftId: x.shiftId, from: localStamp(tz, x.a), to: localStamp(tz, x.b), hours: +((x.b - x.a) / HOUR).toFixed(4) })) });
  }
  const totalCents = out.filter((w) => w.inYear).reduce((a, w) => a + w.qualifiedOtCents, 0);
  return { status, weeks: out, totalCents, flags };
}

// Other pay that covers more than one week is spread over the workweeks it covers in proportion to
// hours worked in each (29 CFR 778.209; FS56A). A single-date amount lands in that date's week.
function allocate(o, w, segs, tz) {
  const from = o.from || o.date, to = o.to || o.date;
  if (!from) return 0;
  const inRange = (x) => { const d = localDate(tz, x.a); return d >= from && d <= to; };
  if (from === to) { const d = from; return (localDate(tz, w.start) <= d && d <= localDate(tz, w.end - 1)) ? o.cents : 0; }
  const all = segs.filter(inRange).reduce((a, x) => a + (x.b - x.a), 0);
  const here = segs.filter((x) => x.week === w && inRange(x)).reduce((a, x) => a + (x.b - x.a), 0);
  return all ? o.cents * here / all : 0;
}

// ---- box 14b [W2]: up to two codes; if any tips came in a nonqualifying occupation, "000" must be one.
function ttocFor(emp, ans, tipsTotal) {
  const e = ans.employees[emp.id] || {};
  if (tipsTotal <= 0) return { codes: [], confirmed: true, note: "no tips reported, box 14b stays empty" };
  let codes = (e.ttoc || []).filter(Boolean).slice(0, 2);
  if (e.nonqualifyingTips && !codes.includes("000")) codes = [codes[0], "000"].filter(Boolean).slice(0, 2);
  return { codes, confirmed: !!e.ttocConfirmed && codes.length > 0, suggested: e.ttocSuggested || null };
}

const DEFAULT_ANSWERS = {
  workweekStart: { weekday: 0, hour: 0 }, // Sunday 00:00 local — asked, never assumed silently
  cashPaymentTipsInDeclarations: false,
  serviceChargesTo: "house", // "house" (kept by the business) | "server" (paid to whoever rang the order)
  employees: {},
};

function report(input, answers) {
  const ans = { ...DEFAULT_ANSWERS, ...(answers || {}), employees: { ...((answers || {}).employees || {}) } };
  const { tz, year } = input.business;
  const weeks = workweeks(tz, year, ans.workweekStart.weekday, ans.workweekStart.hour);
  const asked = (k) => answers && answers[k] !== undefined;
  const assumptions = [
    { key: "workweekStart", text: `Workweek starts ${WEEKDAYS[ans.workweekStart.weekday]} ${String(ans.workweekStart.hour).padStart(2, "0")}:00 (${tz})`, answered: asked("workweekStart") },
    { key: "serviceChargesTo", text: ans.serviceChargesTo === "server" ? "Service charges are paid to the employee who rang the order (counted as wages in their regular rate, never as tips)" : "Service charges are kept by the business (not tips, not in anyone's regular rate)", answered: asked("serviceChargesTo") },
    { key: "cashPaymentTipsInDeclarations", text: ans.cashPaymentTipsInDeclarations ? "Clock-out cash tip declarations already include tips rung on cash payments (counted once)" : "Tips rung on cash payments are separate from clock-out cash tip declarations (both counted)", answered: asked("cashPaymentTipsInDeclarations") },
  ];
  const employees = input.employees.map((emp) => {
    const e = ans.employees[emp.id] || {};
    const tips = tipsFor(emp, input, ans);
    const ot = overtimeFor(emp, input, ans, weeks);
    const ttoc = ttocFor(emp, ans, tips.totalCents);
    const flags = [...ot.flags];
    if (!e.statusConfirmed) flags.push(`Pay type assumed "${ot.status === "exempt" ? "exempt" : ot.status}" — confirm (exempt staff get no TT)`);
    if (ot.status === "hourly" && !(e.rates && e.rates.length) && ot.weeks.length) flags.push("No hourly rate entered: Clover does not hold wages. Overtime cannot be figured until you enter one.");
    if (tips.totalCents > 0 && !ttoc.confirmed) flags.push("Tipped occupation code not confirmed");
    if (e.tipShareInCents === undefined && e.tipShareOutCents === undefined && tips.totalCents > 0) flags.push("Tip sharing outside Clover assumed none — confirm");
    if (e.otherPay === undefined && ot.weeks.some((w) => w.otHours > 0)) flags.push("Off-register pay (bonuses, differentials) assumed none — it would raise the regular rate");
    if (tips.serviceChargesExcluded.totalCents) flags.push(`${tips.serviceChargesExcluded.rows.length} service charge(s) excluded from tips`);
    const weeksAffected = ot.weeks.filter((w) => w.flags.length && w.otHours > 0).length;
    return { id: emp.id, name: emp.name, role: emp.role || "", status: ot.status,
      boxes: { TP: tips.totalCents, TT: ot.totalCents, "14b": ttoc.codes },
      ttoc, tips, overtime: ot, flags, weeksAffected,
      ready: flags.filter((f) => !/service charge\(s\) excluded/.test(f)).length === 0 };
  });
  return {
    business: input.business, year, generatedFrom: input.source || "register",
    weeks: weeks.length, assumptions, employees,
    totals: { TP: employees.reduce((a, x) => a + x.boxes.TP, 0), TT: employees.reduce((a, x) => a + x.boxes.TT, 0),
      flagged: employees.filter((x) => !x.ready).length, employees: employees.length },
    disclaimer: "We calculate and show the math. You or your accountant review and file. We never send anything to the IRS or SSA.",
  };
}

const API = { report, workweeks, zoned, localDate, tzOffset, rateOn, DEFAULT_ANSWERS, HOUR, WEEK, WEEKDAYS };
// Same file runs in Node (the functions, the tests) and in the browser (the report page recomputes as
// the owner answers). scripts/deploy.py copies it to public/js/ unchanged.
if (typeof module !== "undefined" && module.exports) module.exports = API; else globalThis.W2Engine = API;

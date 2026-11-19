// The worker's side: the "no tax on tips" and "no tax on overtime" deductions, Schedule 1-A (Form
// 1040) Parts II and III, line by line. Pure, deterministic, no network, no model. The same file runs
// in Node (the MCP tools, the tests) and in the browser (the worksheet page); deploy.py copies it.
//
// Money is integer cents. Every rule carries the id of the source it came from; SOURCES has the
// URL and a sentence quoted verbatim from the copy saved in regs/ (tests/sources.test.js checks
// each quote is really in that file).

const SOURCES = {
  IRC224: { title: "26 U.S.C. § 224 (qualified tips)", url: "https://www.law.cornell.edu/uscode/text/26/224", file: "usc26_224.txt",
    quote: "The amount allowed as a deduction under this section for any taxable year shall not exceed $25,000." },
  IRC224_PHASE: { title: "26 U.S.C. § 224(b)(2)", url: "https://www.law.cornell.edu/uscode/text/26/224", file: "usc26_224.txt",
    quote: "shall be reduced (but not below zero) by $100 for each $1,000 by which the taxpayer’s modified adjusted gross income exceeds $150,000 ($300,000 in the case of a joint return)." },
  IRC224_MFJ: { title: "26 U.S.C. § 224(f)", url: "https://www.law.cornell.edu/uscode/text/26/224", file: "usc26_224.txt",
    quote: "this section shall apply only if the taxpayer and the taxpayer’s spouse file a joint return for the taxable year." },
  IRC224_SSN: { title: "26 U.S.C. § 224(e)", url: "https://www.law.cornell.edu/uscode/text/26/224", file: "usc26_224.txt",
    quote: "No deduction shall be allowed under this section unless the taxpayer includes on the return of tax for the taxable year such individual’s social security number." },
  IRC224_OCC: { title: "26 U.S.C. § 224(d)(1)", url: "https://www.law.cornell.edu/uscode/text/26/224", file: "usc26_224.txt",
    quote: "The term “qualified tips” means cash tips received by an individual in an occupation which customarily and regularly received tips on or before December 31, 2024, as provided by the Secretary." },
  IRC224_SE: { title: "26 U.S.C. § 224(c)", url: "https://www.law.cornell.edu/uscode/text/26/224", file: "usc26_224.txt",
    quote: "such qualified tips shall be taken into account under subsection (a) only to the extent that the gross income for the taxpayer from such trade or business for such taxable year (including such qualified tips) exceeds the sum of the deductions" },
  IRC224_END: { title: "26 U.S.C. § 224(h)", url: "https://www.law.cornell.edu/uscode/text/26/224", file: "usc26_224.txt",
    quote: "No deduction shall be allowed under this section for any taxable year beginning after December 31, 2028." },
  IRC225: { title: "26 U.S.C. § 225 (qualified overtime)", url: "https://www.law.cornell.edu/uscode/text/26/225", file: "usc26_225.txt",
    quote: "The amount allowed as a deduction under this section for any taxable year shall not exceed $12,500 ($25,000 in the case of a joint return)." },
  IRC225_DEF: { title: "26 U.S.C. § 225(c)(1)", url: "https://www.law.cornell.edu/uscode/text/26/225", file: "usc26_225.txt",
    quote: "the term “qualified overtime compensation” means overtime compensation paid to an individual required under section 7 of the Fair Labor Standards Act of 1938 that is in excess of the regular rate (as used in such section) at which such individual is employed." },
  IRC225_MFJ: { title: "26 U.S.C. § 225(e)", url: "https://www.law.cornell.edu/uscode/text/26/225", file: "usc26_225.txt",
    quote: "this section shall apply only if the taxpayer and the taxpayer’s spouse file a joint return for the taxable year." },
  REG224: { title: "26 CFR § 1.224-1, T.D. 10044, 91 FR 19026 (Apr. 13, 2026)", url: "https://www.federalregister.gov/documents/2026/04/13/2026-07104/occupations-that-customarily-and-regularly-received-tips-definition-of-qualified-tips", file: "td10044.txt",
    quote: "shall not exceed $25,000, regardless of filing status." },
  REG224_SC: { title: "26 CFR § 1.224-1(c)(4)", url: "https://www.federalregister.gov/documents/2026/04/13/2026-07104/occupations-that-customarily-and-regularly-received-tips-definition-of-qualified-tips", file: "td10044.txt",
    quote: "service charges, automatic gratuities and any other mandatory amounts automatically added to a customer’s (i.e., the payor’s) bill by the vendor or establishment are not qualified tips" },
  S1A26: { title: "Schedule 1-A (Form 1040) 2026, DRAFT created 6/16/26", url: "https://www.irs.gov/pub/irs-dft/f1040s1a--dft.pdf", file: "f1040s1a_2026_draft.txt",
    quote: "Divide line 12 by $1,000. If the resulting number isn’t a whole number, decrease the result to the next" },
  S1A25: { title: "Schedule 1-A (Form 1040) 2025", url: "https://www.irs.gov/pub/irs-pdf/f1040s1a.pdf", file: "f1040s1a_2025.txt",
    quote: "Divide line 10 by $1,000. If the resulting number isn’t a whole number, decrease the result to the next" },
  F1040_26: { title: "Form 1040 (2026), DRAFT created 8/19/26, line 13a", url: "https://www.irs.gov/pub/irs-dft/f1040--dft.pdf", file: "f1040_2026_draft.txt",
    quote: "Additional deductions from Schedule 1-A, line 44" },
  W2_26: { title: "2026 General Instructions for Forms W-2 and W-3", url: "https://www.irs.gov/instructions/iw2w3", file: "iw2w3.txt",
    quote: "only the “half” portion of “time-and-a-half” compensation would be reported using code TT." },
  W2_14B: { title: "2026 General Instructions for Forms W-2 and W-3, box 14b", url: "https://www.irs.gov/instructions/iw2w3", file: "iw2w3.txt",
    quote: "If any tips were received in a nonqualifying occupation, then “000” must be input as one of the occupation code(s)." },
  N2569: { title: "IRS Notice 2025-69", url: "https://www.irs.gov/pub/irs-drop/n-25-69.pdf", file: "n-25-69.txt",
    quote: "the individual may use one-third of that aggregate dollar" },
  N2569_EXEMPT: { title: "IRS Notice 2025-69", url: "https://www.irs.gov/pub/irs-drop/n-25-69.pdf", file: "n-25-69.txt",
    quote: "Overtime compensation paid to FLSA-ineligible employees is not qualified overtime compensation" },
  N2569_SSTB: { title: "IRS Notice 2025-69 (SSTB transition)", url: "https://www.irs.gov/pub/irs-drop/n-25-69.pdf", file: "n-25-69.txt",
    quote: "the IRS will treat the employee as having received tips in the course of a trade or business that is not a" },
  TTOC: { title: "IRS list of tipped occupations (Treasury Tipped Occupation Codes)", url: "https://www.irs.gov/tippedoccupations", file: "tippedoccupations.txt",
    quote: "Related standard occupational classification code (related SOC code)" },
  RP2532: { title: "Rev. Proc. 2025-32 (2026 tax rate tables, standard deduction)", url: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf", file: "rp-25-32.txt",
    quote: "For taxable years beginning in 2026, the tax rate tables under" },
};

const YEARS = [2025, 2026, 2027, 2028]; // §224(h), §225(g): no deduction for years beginning after 2028
const STATUSES = { single: "Single", mfj: "Married filing jointly", mfs: "Married filing separately", hoh: "Head of household", qss: "Qualifying surviving spouse" };
const TIPS_CAP = 2500000; // $25,000 per return, any filing status [IRC224, REG224]
const OT_CAP = (st) => (st === "mfj" ? 2500000 : 1250000); // [IRC225]
const THRESHOLD = (st) => (st === "mfj" ? 30000000 : 15000000); // "in the case of a joint return" [IRC224_PHASE]

// 2026 ordinary rates [RP2532 §4.01 Tables 1-3] and standard deduction [RP2532 §4.14], in dollars.
const BRACKETS_2026 = {
  mfj: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
  hoh: [[17700, 0.10], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
  single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
};
BRACKETS_2026.qss = BRACKETS_2026.mfj; // Table 1 is "Married Individuals Filing Joint Returns and Surviving Spouses"
BRACKETS_2026.mfs = [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [384350, 0.35], [Infinity, 0.37]];
const STD_DED_2026 = { mfj: 32200, qss: 32200, hoh: 24150, single: 16100, mfs: 16100 };

const c = (x) => (x === undefined || x === null || x === "" ? null : Math.round(Number(String(x).replace(/[$,\s]/g, "")) * 100)); // dollars -> cents, null when absent
const has = (x) => x !== null && !Number.isNaN(x);
const usd = (cents) => (cents < 0 ? "-" : "") + "$" + (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function taxOn(status, taxableDollars) { // federal ordinary income tax, 2026 tables, dollars in, dollars out
  const b = BRACKETS_2026[status] || BRACKETS_2026.single;
  let tax = 0, low = 0;
  for (const [top, rate] of b) {
    if (taxableDollars <= low) break;
    tax += (Math.min(taxableDollars, top) - low) * rate;
    low = top;
  }
  return Math.round(tax * 100) / 100;
}

// Schedule 1-A phase-out, the same four lines in Part II and Part III [S1A26 lines 10-15 / 22-27]:
// excess = MAGI - threshold; steps = whole thousands, rounded DOWN; cut = steps x $100.
function phaseOut(capped, magiCents, status) {
  const threshold = THRESHOLD(status);
  const excess = magiCents - threshold;
  if (excess <= 0) return { threshold, excess: 0, steps: 0, cut: 0, after: capped };
  const steps = Math.floor(excess / 100000);
  const cut = steps * 10000;
  return { threshold, excess, steps, cut, after: Math.max(0, capped - cut) };
}

// One job's overtime when no box 12 TT is in hand: the reasonable methods of Notice 2025-69
// (A: premium separately stated; B: 1.5x total / 3; C: premium above regular at a higher multiple
// x fraction; D: total at a higher multiple x smaller fraction), and hours x half x regular rate.
function overtimeOf(j, flags, i) {
  const tag = `Job ${i + 1}`;
  if (j.flsa_exempt === true || j.flsa_exempt === "true") {
    flags.push({ level: "stop", text: `${tag}: you said you are FLSA-exempt, so none of its overtime qualifies, whatever it paid.`, src: "N2569_EXEMPT" });
    return { cents: 0, how: "FLSA-exempt: none qualifies", src: "N2569_EXEMPT", source: "rule" };
  }
  const tt = c(j.box12_tt);
  if (has(tt)) return { cents: tt, how: "W-2 box 12 code TT", src: "W2_26", source: "w2" };
  const mult = Number(j.ot_multiplier) || 1.5;
  const hrs = Number(j.ot_hours_over_40), rate = c(j.regular_rate);
  if (hrs > 0 && has(rate)) {
    const cents = Math.round(hrs * 0.5 * rate);
    if (mult !== 1.5) flags.push({ level: "info", text: `${tag}: paid at ${mult}x, but only the FLSA half (0.5 x regular rate) qualifies.`, src: "W2_26" });
    return { cents, how: `${hrs} h over 40 x 0.5 x ${usd(rate)} regular rate`, src: "IRC225_DEF", source: "estimate" };
  }
  const total = c(j.ot_pay_total);
  if (has(total) && total > 0) {
    const f = 0.5 / mult; // 1.5x -> 1/3 (method B); 2x -> 1/4 (method D)
    return { cents: Math.round(total * f), how: `${usd(total)} overtime pay at ${mult}x x ${f === 1 / 3 ? "1/3" : f.toFixed(4)}`, src: "N2569", source: "estimate" };
  }
  const prem = c(j.ot_premium_paid);
  if (has(prem) && prem > 0 && mult > 1) {
    const f = 0.5 / (mult - 1); // 1.5x -> all of it (method A); 2x -> 1/2 (method C)
    return { cents: Math.round(prem * f), how: `${usd(prem)} premium above regular pay at ${mult}x x ${f === 1 ? "1" : f.toFixed(4)}`, src: "N2569", source: "estimate" };
  }
  return { cents: 0, how: "no overtime given", src: null, source: "none" };
}

function tipsOf(j, flags, i, ttocTable) {
  const tag = `Job ${i + 1}`;
  const tp = c(j.box12_tp), stub = c(j.tips_paystub), f4137 = c(j.form4137_tips) || 0;
  const nonq = c(j.nonqualified_tips) || 0;
  const codes = (Array.isArray(j.box14b) ? j.box14b : String(j.box14b || "").split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean);
  let base, how, source;
  if (has(tp)) { base = tp; how = "W-2 box 12 code TP"; source = "w2"; }
  else if (has(stub)) { base = stub; how = "tips from pay stubs (estimate until the W-2 arrives)"; source = "estimate"; }
  else { base = 0; how = "no W-2 tips given"; source = "none"; }
  if (codes.includes("000") && !c(j.nonqualified_tips) && base > 0)
    flags.push({ level: "ask", text: `${tag}: box 14b shows 000, so some of these tips came in an occupation that is not on the IRS list. Tell me how much, and it comes off.`, src: "W2_14B" });
  for (const code of codes) if (code !== "000" && ttocTable && !ttocTable[code])
    flags.push({ level: "ask", text: `${tag}: ${code} is not a Treasury Tipped Occupation Code. Check box 14b.`, src: "TTOC" });
  const qualifiedW2 = Math.max(0, base - nonq);
  const larger = Math.max(qualifiedW2, f4137); // 2026 Schedule 1-A line 4 col (v): the larger of (iii) or (iv)
  return { w2: qualifiedW2, f4137, larger, how: nonq ? `${how}, less ${usd(nonq)} earned in an unlisted occupation` : how, codes, source };
}

function compute(input) {
  const inp = input || {};
  const year = Number(inp.tax_year) || 2026;
  const status = STATUSES[inp.filing_status] ? inp.filing_status : "single";
  const flags = [];
  const used = new Set(["IRC224", "IRC225", "IRC224_PHASE"]);
  const ttocTable = inp._ttoc || (typeof globalThis !== "undefined" && globalThis.W2Ttoc ? globalThis.W2Ttoc.TTOC : null);
  if (!YEARS.includes(year)) flags.push({ level: "stop", text: `There is no such deduction for ${year}: it covers tax years 2025 through 2028.`, src: "IRC224_END" });
  if (!inp.filing_status) flags.push({ level: "ask", text: "Filing status not given: figured as single. Married couples must file jointly to get either deduction.", src: "IRC224_MFJ" });
  const blocked = status === "mfs" || inp.valid_ssn === false || inp.valid_ssn === "false" || !YEARS.includes(year);
  if (status === "mfs") flags.push({ level: "stop", text: "Married filing separately: neither deduction is allowed. Filing jointly is the only way to claim them.", src: "IRC224_MFJ" });
  if (inp.valid_ssn === false || inp.valid_ssn === "false") flags.push({ level: "stop", text: "No Social Security number valid for work: neither deduction is allowed.", src: "IRC224_SSN" });

  let magi = c(inp.magi);
  if (!has(magi)) magi = c(inp.agi);
  if (!has(magi)) { magi = 0; flags.push({ level: "ask", text: "Income (MAGI) not given, so the phase-out was not applied. It only starts above $150,000 ($300,000 joint).", src: "IRC224_PHASE" }); }

  const jobs = Array.isArray(inp.jobs) ? inp.jobs : [];
  const jobRows = jobs.map((j, i) => {
    const t = tipsOf(j, flags, i, ttocTable);
    const o = overtimeOf(j, flags, i);
    if (o.src) used.add(o.src);
    if (t.codes.includes("000")) used.add("W2_14B");
    return { label: String(j.employer || j.label || `Job ${i + 1}`).slice(0, 40), tips: t, overtime: o };
  });
  const se = (Array.isArray(inp.self_employed) ? inp.self_employed : []).map((s, i) => {
    const tips = c(s.tips_1099) || 0, profit = c(s.net_profit), other = c(s.other_deductions) || 0;
    const room = has(profit) ? Math.max(0, profit - other) : tips;
    if (!has(profit) && tips) flags.push({ level: "ask", text: `Business ${i + 1}: net profit not given. Self-employed tips count only up to the business's profit.`, src: "IRC224_SE" });
    used.add("IRC224_SE");
    return { label: String(s.business || `Business ${i + 1}`).slice(0, 40), tips, profit, other, room, counted: Math.min(tips, room) };
  });
  const ot1099 = c(inp.ot_1099) || 0;

  // Part II, tips [S1A26 lines 4-15]
  const L5 = jobRows.reduce((a, r) => a + r.tips.larger, 0);
  const L7 = se.reduce((a, r) => a + r.counted, 0);
  const L8 = L5 + L7;
  const L9 = Math.min(L8, TIPS_CAP);
  const pt = phaseOut(L9, magi, status);
  const tipsDed = blocked ? 0 : pt.after;
  // Part III, overtime [S1A26 lines 16-27]
  const L17 = jobRows.reduce((a, r) => a + r.overtime.cents, 0);
  const L20 = L17 + ot1099;
  const L21 = Math.min(L20, OT_CAP(status));
  const po = phaseOut(L21, magi, status);
  const otDed = blocked ? 0 : po.after;
  if (L8 > TIPS_CAP) flags.push({ level: "info", text: `Tips over the $25,000 cap: ${usd(L8 - TIPS_CAP)} does not count.`, src: "REG224" });
  if (L20 > OT_CAP(status)) flags.push({ level: "info", text: `Overtime over the ${usd(OT_CAP(status))} cap: ${usd(L20 - OT_CAP(status))} does not count.`, src: "IRC225" });
  if (L8 > 0) { used.add("TTOC"); used.add("N2569_SSTB"); used.add("REG224_SC"); }
  if (jobRows.some((r) => r.tips.source === "estimate" || r.overtime.source === "estimate"))
    flags.push({ level: "info", text: "Some figures are pay-stub estimates. For tax year 2026 the return uses W-2 box 12 TP and TT; swap them in when the W-2 arrives (due Jan 31, 2027).", src: "S1A26" });

  const lines = year === 2025 ? lines2025({ jobRows, se, ot1099, L5, L7, L8, L9, pt, tipsDed, L17, L20, L21, po, otDed, magi, status })
    : lines2026({ jobRows, se, ot1099, L5, L7, L8, L9, pt, tipsDed, L17, L20, L21, po, otDed, magi, status });
  used.add(year === 2025 ? "S1A25" : "S1A26");
  if (year !== 2025) used.add("F1040_26");

  const total = tipsDed + otDed;
  // What it is worth: 2026 tables only, standard deduction, before credits; a stated estimate.
  let saved = null;
  if (year === 2026 && has(c(inp.magi) ?? c(inp.agi)) && !blocked && total > 0) {
    const agi = (c(inp.agi) ?? c(inp.magi)) / 100;
    const before = Math.max(0, agi - STD_DED_2026[status]);
    const after = Math.max(0, before - total / 100);
    saved = { cents: Math.round((taxOn(status, before) - taxOn(status, after)) * 100), taxableBefore: before, taxableAfter: after, standardDeduction: STD_DED_2026[status],
      note: "Estimate: standard deduction, 2026 ordinary rates, before credits, no other Schedule 1-A deductions. Social Security and Medicare tax and state income tax are not reduced." };
    used.add("RP2532");
  }

  return {
    tax_year: year, filing_status: status, filing_status_label: STATUSES[status], magi_cents: magi,
    tips: { qualified_cents: L8, capped_cents: L9, phase_out: pt, deduction_cents: tipsDed },
    overtime: { qualified_cents: L20, capped_cents: L21, cap_cents: OT_CAP(status), phase_out: po, deduction_cents: otDed },
    total_cents: total, jobs: jobRows, self_employed: se, ot_1099_cents: ot1099,
    lines, form1040: year === 2025 ? "Form 1040 (2025) line 13b, through Schedule 1-A line 38" : `Form 1040 (${year}) line 13a, through Schedule 1-A line 44 (2026 draft numbering)`,
    saved, flags, sources: [...used].filter((k) => SOURCES[k]).map((k) => ({ id: k, title: SOURCES[k].title, url: SOURCES[k].url })),
    disclaimer: "This calculates and shows the math from the figures given. It does not file anything. Keep the W-2s and records the figures came from.",
  };
}

function lines2026(x) {
  const L = [];
  L.push({ line: "3", text: "MAGI (Form 1040 line 11b plus excluded foreign/territory income)", cents: x.magi });
  x.jobRows.forEach((r, i) => { if (r.tips.larger || r.tips.w2 || r.tips.f4137) L.push({ line: `4${"abcde"[i] || "e+"}`, text: `${r.label}: (iii) qualified tips in box 12 TP ${usd(r.tips.w2)}, (iv) Form 4137 ${usd(r.tips.f4137)}, (v) the larger`, cents: r.tips.larger }); });
  L.push({ line: "5", text: "Add lines 4a-4e, column (v)", cents: x.L5 });
  x.se.forEach((s, i) => L.push({ line: `6${"abcde"[i] || "e+"}`, text: `${s.label}: tips ${usd(s.tips)}, limited to profit less other deductions ${usd(s.room)}`, cents: s.counted }));
  L.push({ line: "7", text: "Add lines 6a-6e, column (xiii)", cents: x.L7 });
  L.push({ line: "8", text: "Add lines 5 and 7", cents: x.L8 });
  L.push({ line: "9", text: "Smaller of line 8 or $25,000", cents: x.L9 });
  L.push({ line: "11", text: "Phase-out threshold", cents: x.pt.threshold });
  L.push({ line: "12", text: "Line 3 minus line 11 (zero or less: skip to line 15)", cents: x.pt.excess });
  L.push({ line: "13", text: "Line 12 / $1,000, rounded DOWN to a whole number", value: x.pt.steps });
  L.push({ line: "14", text: "Line 13 x $100", cents: x.pt.cut });
  L.push({ line: "15", text: "Qualified tips deduction", cents: x.tipsDed, total: true });
  x.jobRows.forEach((r, i) => { if (r.overtime.cents) L.push({ line: `16${"abcde"[i] || "e+"}`, text: `${r.label}: qualified overtime (${r.overtime.how})`, cents: r.overtime.cents }); });
  L.push({ line: "17", text: "Add lines 16a-16e", cents: x.L17 });
  L.push({ line: "19", text: "Qualified overtime on Form 1099-NEC box 1d / 1099-MISC box 14", cents: x.ot1099 });
  L.push({ line: "20", text: "Add lines 17 and 19", cents: x.L20 });
  L.push({ line: "21", text: `Smaller of line 20 or ${usd(OT_CAP(x.status))}`, cents: x.L21 });
  L.push({ line: "23", text: "Phase-out threshold", cents: x.po.threshold });
  L.push({ line: "24", text: "Line 22 (= line 3) minus line 23", cents: x.po.excess });
  L.push({ line: "25", text: "Line 24 / $1,000, rounded DOWN to a whole number", value: x.po.steps });
  L.push({ line: "26", text: "Line 25 x $100", cents: x.po.cut });
  L.push({ line: "27", text: "Qualified overtime compensation deduction", cents: x.otDed, total: true });
  return L;
}

function lines2025(x) {
  const L = [];
  L.push({ line: "3", text: "MAGI", cents: x.magi });
  L.push({ line: "4c", text: "Qualified tips as an employee (W-2 box 7 / Form 4137, the larger per employer)", cents: x.L5 });
  L.push({ line: "5", text: "Qualified tips in a trade or business, up to net profit", cents: x.L7 });
  L.push({ line: "6", text: "Add lines 4c and 5", cents: x.L8 });
  L.push({ line: "7", text: "Smaller of line 6 or $25,000", cents: x.L9 });
  L.push({ line: "9", text: "Phase-out threshold", cents: x.pt.threshold });
  L.push({ line: "10", text: "Line 8 (= line 3) minus line 9", cents: x.pt.excess });
  L.push({ line: "11", text: "Line 10 / $1,000, rounded DOWN", value: x.pt.steps });
  L.push({ line: "12", text: "Line 11 x $100", cents: x.pt.cut });
  L.push({ line: "13", text: "Qualified tips deduction", cents: x.tipsDed, total: true });
  L.push({ line: "14a", text: "Qualified overtime in W-2 box 1", cents: x.L17 });
  L.push({ line: "14b", text: "Qualified overtime in Form 1099-NEC/MISC", cents: x.ot1099 });
  L.push({ line: "15", text: `Smaller of line 14c or ${usd(OT_CAP(x.status))}`, cents: x.L21 });
  L.push({ line: "17", text: "Phase-out threshold", cents: x.po.threshold });
  L.push({ line: "18", text: "Line 16 (= line 3) minus line 17", cents: x.po.excess });
  L.push({ line: "19", text: "Line 18 / $1,000, rounded DOWN", value: x.po.steps });
  L.push({ line: "20", text: "Line 19 x $100", cents: x.po.cut });
  L.push({ line: "21", text: "Qualified overtime compensation deduction", cents: x.otDed, total: true });
  return L;
}

// What the tips deduction can be worth to someone earning `payDollars` a year (all of it ordinary
// wage income, tips included, as OEWS counts wages), filing `status` with the standard deduction:
// per $1,000 of tips, and at most (if $25,000 or all of their pay, whichever is less, were tips).
function worth(payDollars, status = "single") {
  const taxable = Math.max(0, payDollars - STD_DED_2026[status]);
  const per1000 = taxOn(status, taxable) - taxOn(status, Math.max(0, taxable - 1000));
  const most = taxOn(status, taxable) - taxOn(status, Math.max(0, taxable - Math.min(25000, payDollars)));
  return { taxable, per1000: Math.round(per1000), most: Math.round(most), taxBefore: Math.round(taxOn(status, taxable)) };
}

const DEDUCTION = { compute, worth, taxOn, phaseOut, SOURCES, STATUSES, YEARS, TIPS_CAP, OT_CAP, STD_DED_2026, BRACKETS_2026, usd };
if (typeof module !== "undefined" && module.exports) module.exports = DEDUCTION; else globalThis.W2Deduction = DEDUCTION;

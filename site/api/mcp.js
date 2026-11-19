// MCP server (Streamable HTTP, stateless JSON). Three tools: the worker's deduction, the owner's
// W-2 boxes, and the tipped-occupation lookup. Every number comes from code (_deduction.js, the
// register engine via _payroll.js, OEWS tables); the assistant only carries it to the person.
//
// Privacy, written down because it is the design: nothing a caller sends is stored. The worksheet
// link carries the figures in the URL FRAGMENT (#w1.…). A browser never sends a fragment to a server,
// so the figures never reach Vercel's logs; the worksheet page reads it and deletes it from the
// address bar before any analytics script loads, so they never reach PostHog or Vercel Analytics
// either. Only ?src=mcp stays visible, which is how a person arriving from a chat is counted.
// A short-lived server token was the alternative; it would mean storing the figures, so no.
const crypto = require("node:crypto");
const D = require("./_deduction.js");
const { TTOC, suggestTtoc } = require("./_ttoc.js");
const { boxes } = require("./_payroll.js");
const OCC = require("./_occupations.json");

const SITE = "https://tip-overtime-w2.vercel.app";
const VERSION = "0.1.0";
const PH_KEY = "phc_yFgRGppL6H7DvhgZTQKbHdrY5oqnpLT482rrNYtLqnAx"; // public project key, same as the page block
const ANN = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true };
const money = { type: ["number", "string"] };

const TOOLS = [
  {
    name: "tip_overtime_deduction",
    title: "How much of my tips and overtime can I deduct (no tax on tips / no tax on overtime)",
    description: "Works out the federal 'no tax on tips' and 'no tax on overtime' deductions (Schedule 1-A, Form 1040, tax years 2025-2028) from what the person has: W-2 box 12 code TP and TT and box 14b, Form 4137, 1099s, or pay stubs before the W-2 arrives (hours over 40 and hourly rate, or overtime pay and its multiplier). Returns each deduction with the math line by line as it goes on Schedule 1-A, the Form 1040 line it lands on, the estimated federal income tax saved, what is still unknown, a citation for every rule, and a worksheet link that opens the filled-in Schedule 1-A worksheet to print or hand to a preparer. Use for 'how much of my tips can I deduct', 'does no tax on overtime apply to me', 'what goes on Schedule 1-A', 'I made $X in tips as a server'. Only the FLSA half of time-and-a-half counts as qualified overtime. Married filing separately gets nothing. Pass dollar amounts as numbers. Filing status and income (AGI) set the phase-out and the tax-saved estimate; without them the result says what is missing instead of assuming them.",
    inputSchema: { type: "object", properties: {
      tax_year: { type: "integer", enum: [2025, 2026, 2027, 2028], description: "Tax year (default 2026, filed in 2027)" },
      filing_status: { type: "string", enum: ["single", "mfj", "mfs", "hoh", "qss"], description: "single, mfj (married filing jointly), mfs (married filing separately), hoh (head of household), qss (qualifying surviving spouse)" },
      agi: { ...money, description: "Adjusted gross income (Form 1040 line 11b), dollars. Used as MAGI unless magi is given." },
      magi: { ...money, description: "Modified AGI if different: AGI plus excluded Puerto Rico / foreign earned income (Schedule 1-A line 3)" },
      valid_ssn: { type: "boolean", description: "false if the person (or the spouse who earned the tips/overtime) has no Social Security number valid for work. Default true." },
      jobs: { type: "array", description: "One entry per employer (W-2).", items: { type: "object", properties: {
        employer: { type: "string", description: "A label for the job, e.g. 'restaurant'. Not stored." },
        box12_tp: { ...money, description: "W-2 box 12 code TP: cash tips reported to the employer" },
        box14b: { type: "string", description: "W-2 box 14b Treasury Tipped Occupation Code(s), e.g. '102' or '101 000'" },
        nonqualified_tips: { ...money, description: "Part of TP earned in an occupation NOT on the IRS list (only when 14b shows 000)" },
        form4137_tips: { ...money, description: "Form 4137 line 1 column (c) for this employer: all cash and charge tips received, if Form 4137 is filed" },
        tips_paystub: { ...money, description: "Tips from pay stubs, year to date, when there is no W-2 yet (estimate)" },
        box12_tt: { ...money, description: "W-2 box 12 code TT: qualified overtime" },
        ot_hours_over_40: { type: "number", description: "Without a W-2: total hours over 40 in a workweek across the year" },
        regular_rate: { ...money, description: "Without a W-2: regular hourly rate, dollars" },
        ot_pay_total: { ...money, description: "Without a W-2: total overtime pay shown on stubs (the whole 1.5x or 2x amount)" },
        ot_premium_paid: { ...money, description: "Without a W-2: only the premium part above regular pay, if the stub shows it separately" },
        ot_multiplier: { type: "number", description: "Overtime pay multiple: 1.5 (default) or 2 for double time" },
        flsa_exempt: { type: "boolean", description: "true if exempt from FLSA overtime (e.g. salaried manager): nothing qualifies" },
      }, additionalProperties: false } },
      self_employed: { type: "array", description: "Tips earned in the person's own business (1099s).", items: { type: "object", properties: {
        business: { type: "string" }, tips_1099: { ...money, description: "Qualified tips shown on the 1099-NEC/MISC/K" },
        net_profit: { ...money, description: "Schedule C line 31 (or E/F equivalent)" }, other_deductions: { ...money, description: "Other deductions allocable to that business" },
      }, additionalProperties: false } },
      ot_1099: { ...money, description: "Qualified overtime on Form 1099-NEC box 1d / 1099-MISC box 14" },
    }, additionalProperties: false },
    annotations: { title: "Tip and overtime deduction", ...ANN },
  },
  {
    name: "w2_tip_overtime_boxes",
    title: "W-2 box 12 TP, TT and box 14b for each employee, from payroll rows",
    description: "For an owner, bookkeeper or payroll person: works out the new 2026 Form W-2 figures for each employee from payroll rows: box 12 code TP (cash tips reported to the employer), box 12 code TT (qualified overtime: hours over 40 in each FLSA workweek x 0.5 x the regular rate, where the regular rate includes non-discretionary bonuses, tip credit and service charges paid out) and box 14b (Treasury Tipped Occupation Code, suggested from the role). Pass one row per employee per workweek, as rows or as a pasted CSV/tab table with a header (employee, week_start, hours, rate, tips, role; optional tip_credit, other_pay, service_charges, ttoc, exempt). Returns per-employee boxes, every overtime week with its math, flags, and a link to a printable sheet. W-2s for 2026 are due January 31, 2027.",
    inputSchema: { type: "object", properties: {
      tax_year: { type: "integer", description: "Default 2026" },
      table: { type: "string", description: "Pasted CSV or tab-separated table with a header row" },
      rows: { type: "array", items: { type: "object", properties: {
        employee: { type: "string", description: "Name or initials (initials are fine; nothing is stored)" },
        week_start: { type: "string", description: "First day of the FLSA workweek, YYYY-MM-DD. All rows must start on the same weekday." },
        hours: { type: "number", description: "Hours worked in that workweek" },
        rate: money, tips: money, tip_credit: money, other_pay: money, service_charges: money,
        role: { type: "string" }, ttoc: { type: "string" }, exempt: { type: "boolean" },
      }, required: ["employee", "week_start", "hours"], additionalProperties: false } },
    }, additionalProperties: false },
    annotations: { title: "W-2 TP / TT / 14b", ...ANN },
  },
  {
    name: "tipped_occupation_code",
    title: "Does my job qualify for no tax on tips? Treasury Tipped Occupation Code lookup",
    description: "Finds the Treasury Tipped Occupation Code (W-2 box 14b) for a job title, from the IRS list of 71 occupations that customarily received tips before 2025, with the IRS description and examples, the related SOC code, and what the tips deduction is worth at that occupation's median pay (BLS OEWS May 2025): federal income tax saved per $1,000 of tips and the most it can save in a year. Use for 'does my job qualify for no tax on tips', 'what is my tipped occupation code', 'is a barista a tipped occupation'. Pass a job title, or a 3-digit code.",
    inputSchema: { type: "object", properties: { job: { type: "string", description: "Job title in the user's words, or a 3-digit TTOC" } }, required: ["job"], additionalProperties: false },
    annotations: { title: "Tipped occupation lookup", ...ANN },
  },
];

const INSTRUCTIONS = "Tip & Overtime W-2s works out the federal 'no tax on tips' and 'no tax on overtime' deductions and the new W-2 boxes, in code, with the math shown and a citation for every rule. For a worker (server, bartender, stylist, driver, anyone paid overtime), call tip_overtime_deduction with what they have: W-2 box 12 TP/TT, or pay stubs. Ask for filing status and AGI first if not given. For an owner or bookkeeper, call w2_tip_overtime_boxes with payroll rows. For 'does my job qualify', call tipped_occupation_code. Quote every dollar figure exactly as returned, show the Schedule 1-A lines, and always give the worksheet link. It calculates and shows; it does not file anything. Reply in the user's language.";

const b64u = (s) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const tag = (path, frag) => `${SITE}${path}${path.includes("?") ? "&" : "?"}src=mcp${frag ? "#" + frag : ""}`;
const usd = D.usd;

function deduction(args) {
  const r = D.compute({ ...args, _ttoc: TTOC });
  const keep = (({ tax_year, filing_status, agi, magi, valid_ssn, jobs, self_employed, ot_1099 }) => ({ tax_year, filing_status, agi, magi, valid_ssn, jobs, self_employed, ot_1099 }))(args);
  for (const j of keep.jobs || []) delete j.employer; // labels stay in the chat; the link carries numbers only
  const link = tag("/worksheet/", "w1." + b64u(JSON.stringify(keep)));
  const answer = r.total_cents > 0
    ? `Deduct ${usd(r.tips.deduction_cents)} of tips (Schedule 1-A line ${r.tax_year === 2025 ? 13 : 15}) and ${usd(r.overtime.deduction_cents)} of overtime (line ${r.tax_year === 2025 ? 21 : 27}): ${usd(r.total_cents)} in all, on ${r.form1040}.` + (r.saved ? ` Estimated federal income tax saved: ${usd(r.saved.cents)}.` : "")
    : "No deduction from the figures given." + (r.flags.find((f) => f.level === "stop") ? " " + r.flags.find((f) => f.level === "stop").text : "");
  const out = {
    answer, tips_deduction: usd(r.tips.deduction_cents), overtime_deduction: usd(r.overtime.deduction_cents), total: usd(r.total_cents),
    goes_on: r.form1040, estimated_tax_saved: r.saved ? usd(r.saved.cents) : null, saved_basis: r.saved ? r.saved.note : "Give AGI and filing status for a 2026 estimate.",
    schedule_1a: r.lines.map((l) => ({ line: l.line, what: l.text, amount: l.cents !== undefined ? usd(l.cents) : String(l.value) })),
    jobs: r.jobs.map((j) => ({ job: j.label, tips_counted: usd(j.tips.larger), tips_from: j.tips.how, overtime_counted: usd(j.overtime.cents), overtime_from: j.overtime.how })),
    still_to_check: r.flags.map((f) => ({ level: f.level, note: f.text, rule: f.src })),
    rules: r.sources, worksheet: link,
    note: "Calculated from the figures given; nothing filed or stored. Tips must come from an occupation on the IRS list (irs.gov/tippedoccupations); service charges and automatic gratuities are not tips. Social Security, Medicare and state income tax still apply.",
  };
  return { out, log: { has_tips: r.tips.qualified_cents > 0, has_ot: r.overtime.qualified_cents > 0, source: r.jobs.some((j) => j.tips.source === "estimate" || j.overtime.source === "estimate") ? "estimate" : "w2", year: r.tax_year, blocked: r.total_cents === 0 && r.flags.some((f) => f.level === "stop") } };
}

function ownerBoxes(args) {
  const r = boxes(args);
  if (!r.ok) return { out: r, log: { err: "bad_input" }, isError: true };
  const sheet = { y: r.tax_year, w: r.workweek_starts, e: r.employees.map((e) => [e.employee, e.box12_TP, e.box12_TT, e.box14b.join(" "), e.weeks_with_overtime.length, e.flags.length]) };
  const out = { answer: `${r.employees.length} employee${r.employees.length === 1 ? "" : "s"}: box 12 TP ${usd(Math.round(r.totals.box12_TP * 100))}, box 12 TT ${usd(Math.round(r.totals.box12_TT * 100))} in total.`, ...r,
    sheet: tag("/worksheet/", "o1." + b64u(JSON.stringify(sheet))),
    rules: ["W2_26", "W2_14B", "IRC225_DEF", "REG224_SC"].map((k) => ({ id: k, title: D.SOURCES[k].title, url: D.SOURCES[k].url })).concat([{ id: "FS56A", title: "DOL Fact Sheet #56A, regular rate", url: "https://www.dol.gov/agencies/whd/fact-sheets/56a-regular-rate" }, { id: "FS15", title: "DOL Fact Sheet #15, tipped employees", url: "https://www.dol.gov/agencies/whd/fact-sheets/15-tipped-employees-flsa" }]),
    note: "Calculated from the rows given; nothing filed or stored. Only the FLSA half counts in TT, even when double time was paid; daily overtime under state law does not count unless the week also ran past 40 hours. Clover merchants can run the whole year from the register: " + tag("/") };
  return { out, log: { employees: r.employees.length } };
}

function occupation(args) {
  const q = String(args.job || "").trim();
  const byCode = OCC.find((o) => o.code === q);
  let list;
  if (byCode) list = [byCode];
  else {
    const words = q.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
    const hint = suggestTtoc(q);
    list = OCC.map((o) => {
      const hay = (o.title + " " + o.examples + " " + o.description).toLowerCase();
      let s = words.reduce((a, w) => a + (o.title.toLowerCase().includes(w) ? 3 : 0) + (o.examples.toLowerCase().includes(w) ? 2 : 0) + (hay.includes(w) ? 1 : 0), 0);
      if (hint === o.code) s += 4;
      return { o, s };
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.o);
  }
  const out = {
    query: q,
    matches: list.map((o) => ({ code: o.code, occupation: o.title, irs_description: o.description, irs_examples: o.examples, related_soc: o.soc,
      median_pay: o.median ? usd(o.median * 100) : "not published (BLS reports this one hourly only)",
      saves_per_1000_tips_at_median: o.per1000 !== null ? usd(o.per1000 * 100) : null, most_it_can_save_at_median: o.most !== null ? usd(o.most * 100) : null })),
    found: list.length > 0,
    note: list.length ? "The code goes in W-2 box 14b. Tips earned in a job that is not on the IRS list are not qualified tips. Savings assume a single filer, standard deduction, 2026 rates, pay = the BLS median." : "No occupation on the IRS list matches. If the job really is not on the list, its tips do not qualify; check the full list.",
    list: "https://www.irs.gov/tippedoccupations", by_occupation: tag("/no-tax-on-tips-by-occupation/"),
  };
  return { out, log: { found: list.length > 0 } };
}

const text = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 1) }], structuredContent: obj });

function callTool(name, args) {
  if (name === "tip_overtime_deduction") return deduction(args || {});
  if (name === "w2_tip_overtime_boxes") return ownerBoxes(args || {});
  if (name === "tipped_occupation_code") return occupation(args || {});
  return { out: { error: "Unknown tool " + name }, isError: true, log: { err: "unknown_tool" } };
}

const clientOf = (ua) => (/claude/i.test(ua) ? "claude" : /openai|chatgpt/i.test(ua) ? "chatgpt" : /grok|xai/i.test(ua) ? "grok" : /cursor/i.test(ua) ? "cursor" : /node|undici|python|curl/i.test(ua) ? "script" : "other");
// One PostHog event per call: the tool, ok, time, the client family and coarse booleans. Never an
// amount, a name or an argument. No IP either: connector calls come from the assistant's servers
// (claude.ai calls arrive from Anthropic), so any IP-based id would count servers, not people.
// People are counted on the web side, by landings on ?src=mcp links.
async function logCall(tool, ok, ms, meta, extra) {
  if (process.env.TOW_NO_ANALYTICS) return;
  try {
    await fetch("https://us.i.posthog.com/capture/", { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(1500),
      body: JSON.stringify({ api_key: PH_KEY, event: "mcp_tool_call", distinct_id: "mcp_" + crypto.randomUUID(),
        properties: { tool, ok, ms, client: meta.client, client_ua: String(meta.ua).split(/[\/ ;(]/)[0].slice(0, 30), test: meta.test || undefined, site: "tip-overtime-w2", ...extra, $process_person_profile: false, $lib: "tip-overtime-w2-mcp" } }) });
  } catch (e) {}
}

async function handleOne(msg, meta) {
  const { id, method, params } = msg || {};
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  if (method === "initialize") return ok({ protocolVersion: (params && params.protocolVersion) || "2025-06-18", capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "tip-overtime-w2", title: "Tip & Overtime Deductions", version: VERSION, websiteUrl: SITE }, instructions: INSTRUCTIONS });
  if (method === "ping") return ok({});
  if (method === "tools/list") return ok({ tools: TOOLS });
  if (method === "tools/call") {
    const t0 = Date.now(), tool = String((params && params.name) || "");
    let r;
    try { r = callTool(tool, (params && params.arguments) || {}); }
    catch (e) { r = { out: { error: "Error: " + e.message }, isError: true, log: { err: "exception" } }; }
    await logCall(TOOLS.some((t) => t.name === tool) ? tool : "unknown", !r.isError, Date.now() - t0, meta, r.log || {});
    return ok({ ...text(r.out), ...(r.isError ? { isError: true } : {}) });
  }
  if (method === "resources/list") return ok({ resources: [] });
  if (method === "prompts/list") return ok({ prompts: [] });
  if (method && method.startsWith("notifications/")) return null;
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + method } };
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
}

async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type, mcp-session-id, mcp-protocol-version, authorization, x-tow-test");
  res.setHeader("access-control-allow-methods", "POST, GET, OPTIONS, DELETE");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method === "GET") { res.statusCode = 405; res.setHeader("allow", "POST"); res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ name: "Tip & Overtime Deductions MCP", transport: "streamable-http", url: SITE + "/mcp", docs: SITE + "/ai/" })); }
  if (req.method === "DELETE") { res.statusCode = 204; return res.end(); }
  let body;
  try { body = await readBody(req); } catch (e) { res.statusCode = 400; return res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })); }
  const ua = String(req.headers["user-agent"] || "");
  const meta = { ua, client: clientOf(ua), test: req.headers["x-tow-test"] === "1" };
  const batch = Array.isArray(body);
  const out = (await Promise.all((batch ? body : [body]).map((m) => handleOne(m, meta)))).filter(Boolean);
  if (!out.length) { res.statusCode = 202; return res.end(); }
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(batch ? out : out[0]));
}

module.exports = handler;
module.exports.TOOLS = TOOLS;
module.exports.callTool = callTool;
module.exports.handleOne = handleOne;

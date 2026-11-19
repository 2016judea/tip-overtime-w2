// The connector: JSON-RPC shape, explicit annotations (OpenAI rejects a null hint), every number
// from code, and links that carry figures only in the fragment.
process.env.TOW_NO_ANALYTICS = "1";
const test = require("node:test");
const assert = require("node:assert/strict");
const mcp = require("../site/api/mcp.js");

const call = async (name, args) => {
  const r = await mcp.handleOne({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, { ua: "test", client: "script" });
  return r.result;
};
const frag = (url) => JSON.parse(Buffer.from(url.split("#")[1].slice(3).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));

test("tools/list: three tools, every annotation hint an explicit boolean", async () => {
  const r = await mcp.handleOne({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { ua: "", client: "other" });
  assert.equal(r.result.tools.length, 3);
  for (const t of r.result.tools) for (const k of ["readOnlyHint", "destructiveHint", "openWorldHint", "idempotentHint"]) assert.equal(typeof t.annotations[k], "boolean", `${t.name}.${k}`);
});

test("tip_overtime_deduction: server, single, $38,000, TP $14,200, TT $640", async () => {
  const r = await call("tip_overtime_deduction", { filing_status: "single", agi: 38000, jobs: [{ employer: "Larkspur Cafe", box12_tp: 14200, box14b: "102", box12_tt: 640 }] });
  const s = r.structuredContent;
  assert.equal(s.tips_deduction, "$14,200.00");
  assert.equal(s.overtime_deduction, "$640.00");
  assert.equal(s.total, "$14,840.00");
  // taxable 38,000 - 16,100 = 21,900 -> 1,240 + 12% x 9,500 = 2,380; after 7,060 -> 706; saved 1,674
  assert.equal(s.estimated_tax_saved, "$1,674.00");
  assert.ok(s.rules.length >= 5 && s.rules.every((x) => /^https:\/\//.test(x.url)));
  const [base, fragment] = s.worksheet.split("#");
  assert.equal(base, "https://tip-overtime-w2.vercel.app/worksheet/?src=mcp");
  assert.ok(!/14200|38000/.test(base), "no figures in the part a server sees");
  const back = frag(s.worksheet);
  assert.equal(back.jobs[0].box12_tp, 14200);
  assert.equal(back.jobs[0].employer, undefined, "the employer label stays in the chat");
  assert.ok(fragment.startsWith("w1."));
});

test("tip_overtime_deduction: married filing separately answers no deduction, with the reason", async () => {
  const s = (await call("tip_overtime_deduction", { filing_status: "mfs", agi: 50000, jobs: [{ box12_tp: 5000 }] })).structuredContent;
  assert.equal(s.total, "$0.00");
  assert.match(s.answer, /separately/);
});

test("w2_tip_overtime_boxes: pasted table -> TP, TT, 14b per employee and a sheet link", async () => {
  const r = await call("w2_tip_overtime_boxes", { table: "employee,week_start,hours,rate,tips,role\nM,2026-03-01,45,15,300,server\nM,2026-03-08,38,15,250,server" });
  const s = r.structuredContent;
  assert.equal(s.employees[0].box12_TP, 550);
  assert.equal(s.employees[0].box12_TT, 37.5);
  assert.deepEqual(s.employees[0].box14b, ["102"]);
  assert.ok(s.sheet.includes("/worksheet/?src=mcp#o1."));
});

test("w2_tip_overtime_boxes: mixed weekdays are refused, not guessed", async () => {
  const r = await call("w2_tip_overtime_boxes", { rows: [{ employee: "A", week_start: "2026-03-01", hours: 41 }, { employee: "A", week_start: "2026-03-09", hours: 41 }] });
  assert.equal(r.isError, true);
  assert.match(r.structuredContent.error, /same weekday/);
});

test("tipped_occupation_code: 'bartender' -> 101 with the BLS median and what it is worth", async () => {
  const s = (await call("tipped_occupation_code", { job: "bartender" })).structuredContent;
  assert.equal(s.matches[0].code, "101");
  assert.equal(s.matches[0].median_pay, "$34,340.00");
  assert.equal(s.matches[0].saves_per_1000_tips_at_median, "$120.00");
  assert.ok((await call("tipped_occupation_code", { job: "602" })).structuredContent.matches[0].occupation.includes("Massage"));
});

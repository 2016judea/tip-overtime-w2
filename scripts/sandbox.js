#!/usr/bin/env node
// Talk to the SANDBOX test merchant with the token this app holds in D1 (refreshing it the same way
// the site does). Used to seed the sandbox and to dump raw Clover shapes.  node scripts/sandbox.js <cmd>
const fs = require("fs"), path = require("path");
for (const l of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n")) { const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] = l.slice(i + 1); }
const { d1, accessToken, CLOVER } = require("../site/api/_lib");
const MID = process.env.SANDBOX_MID || "4ZNNY5AK5SNT1";
async function api(token, p, method = "GET", body) {
  const r = await fetch(CLOVER().api + p, { method, headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json", "User-Agent": "TipOvertimeW2-seed/1.0" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch (_) { j = t; }
  if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${t.slice(0, 300)}`);
  return j;
}
module.exports = { api, MID };
if (require.main === module) (async () => {
  const [row] = await d1("select * from merchants where merchant_id=?", [MID]);
  const token = await accessToken(row);
  const cmd = process.argv[2];
  if (cmd === "get") console.log(JSON.stringify(await api(token, process.argv[3]), null, 1).slice(0, +process.argv[4] || 4000));
  if (cmd === "seed") await require("./seed_sandbox.js")(token);
})().catch((e) => { console.error(e.message); process.exit(1); });

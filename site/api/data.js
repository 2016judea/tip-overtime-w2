// GET /api/data — the signed-in merchant's 2026 register rows (mapped for the engine) + their saved answers.
// The browser runs the engine (public/js/engine.js = api/_engine.js) on these, so every answer recomputes
// instantly without re-reading Clover.
const { d1, session, accessToken, event } = require("./_lib");
const { pullYear, toEngineInput } = require("./_clover");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const mid = session(req);
  if (!mid) return res.status(401).json({ error: "not signed in" });
  try {
    const [row] = await d1("select * from merchants where merchant_id=?", [mid]);
    if (!row || !row.token_blob) return res.status(401).json({ error: "not connected" });
    const year = 2026;
    const token = await accessToken(row);
    const raw = await pullYear(mid, token, year);
    if (row.tz && !raw.merchant.tz) raw.merchant.tz = row.tz;
    const input = toEngineInput(raw, year);
    await event(mid, "report", `${input.employees.length} emp, ${input.shifts.length} shifts, ${input.payments.length} payments`);
    res.status(200).json({ input, answers: row.answers_json ? JSON.parse(row.answers_json) : {}, pulledAt: raw.pulledAt });
  } catch (e) {
    console.error("[data]", e.message);
    res.status(e.status === 401 ? 401 : 502).json({ error: e.status === 401 ? "Clover sign-in expired" : "Clover did not answer in time" });
  }
};

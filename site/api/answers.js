// POST /api/answers — save the owner's answers (pay rates, exempt status, workweek start, codes, …).
const { d1, session } = require("./_lib");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const mid = session(req);
  if (!mid) return res.status(401).json({ error: "not signed in" });
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  if (body.length > 200000) return res.status(413).json({ error: "too large" });
  try { JSON.parse(body); } catch (_) { return res.status(400).json({ error: "not JSON" }); }
  await d1("update merchants set answers_json=?, updated_at=datetime('now') where merchant_id=?", [body, mid]);
  res.status(200).json({ ok: true });
};

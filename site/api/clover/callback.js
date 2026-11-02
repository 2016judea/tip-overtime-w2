// GET /clover/callback?code=…&merchant_id=…&state=…  (redirect_uri sits under the registered Site URL).
// Exchange the code for an expiring access/refresh pair (OAuth v2), read the merchant's name and time
// zone, seal the pair into D1, set the 12-hour report session, land on /report/.
const { CLOVER, oauth, clover, d1, seal, verify, setSession, event, SITE } = require("../_lib");

module.exports = async (req, res) => {
  try {
    if (!verify(req.query.state)) return res.status(400).send("This sign-in link has expired. Open the app from your Clover dashboard again.");
    if (req.query.error) return res.redirect(302, `${SITE}/connect/?denied=1`);
    const code = String(req.query.code || "");
    const mid = String(req.query.merchant_id || "").replace(/[^A-Za-z0-9]/g, "");
    if (!code || !mid) return res.status(400).send("Clover sent no code or merchant.");
    const tok = await oauth("token", { client_id: CLOVER().appId, client_secret: CLOVER().secret, code });
    const m = await clover(`/v3/merchants/${mid}`, tok.access_token);
    let tz = null;
    try { tz = (await clover(`/v3/merchants/${mid}/properties`, tok.access_token)).timezone || null; } catch (_) {}
    await d1(
      `insert into merchants (merchant_id, env, name, tz, token_blob) values (?,?,?,?,?)
       on conflict(merchant_id) do update set env=excluded.env, name=excluded.name, tz=coalesce(excluded.tz, merchants.tz),
       token_blob=excluded.token_blob, updated_at=datetime('now')`,
      [mid, CLOVER().env, m.name || null, tz, seal({ ...tok, merchant_id: mid })],
    );
    await event(mid, "connected", m.name || "");
    setSession(res, mid);
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, `${SITE}/report/`);
  } catch (e) {
    console.error("[clover/callback]", e.message);
    res.status(502).send("Clover signed you in but we could not save the connection. Open the app from Clover again.");
  }
};

// Shared by the functions. Files starting with "_" are not routes on Vercel.
// Pattern: ~/Desktop/block-brief/site/api/_lib.js (Clover OAuth v2 + D1 over REST, no SDKs).
const crypto = require("crypto");

const SITE = process.env.SITE_URL || "https://tip-overtime-w2.vercel.app";
const CF_ACCT = "6e9ce2a0c1d0c9b570955eaaae7db72d";
const D1 = "2bfd0140-54b3-4d82-94b9-bce04081f3cf";
const UA = "TipOvertimeW2/1.0 (+https://tip-overtime-w2.vercel.app)";

function need(k) {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
}

async function d1(sql, params = []) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCT}/d1/database/${D1}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${need("CLOUDFLARE_API_TOKEN")}`, "content-type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(`d1: ${JSON.stringify(j.errors).slice(0, 300)}`);
  return j.result[0].results;
}

// Tokens are sealed AES-256-GCM under sha256(ACCESS_SECRET): base64(iv|tag|ct).
function key() { return crypto.createHash("sha256").update(need("ACCESS_SECRET")).digest(); }
function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
function unseal(blob) {
  const b = Buffer.from(blob, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
}

const mac = (s) => crypto.createHmac("sha256", need("ACCESS_SECRET")).update(s).digest("hex").slice(0, 32);
function sign(payload, ttlS) {
  const exp = Math.floor(Date.now() / 1000) + ttlS;
  return `${payload}.${exp}.${mac(`${payload}.${exp}`)}`;
}
function verify(token) {
  const [payload, exp, m] = String(token || "").split(".");
  if (!payload || !exp || !m || Number(exp) < Date.now() / 1000) return null;
  const want = mac(`${payload}.${exp}`);
  return m.length === want.length && crypto.timingSafeEqual(Buffer.from(m), Buffer.from(want)) ? payload : null;
}
// The report session: the merchant id, signed, 12 hours, HttpOnly. Only set after a Clover OAuth code
// exchange succeeded for that merchant, so knowing a merchant id is never enough to read its report.
function setSession(res, mid) {
  res.setHeader("Set-Cookie", `tow=${sign(mid, 43200)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`);
}
function session(req) {
  const m = /(?:^|;\s*)tow=([^;]+)/.exec(req.headers.cookie || "");
  return m ? verify(decodeURIComponent(m[1])) : null;
}

// CLOVER_ENV picks host AND credential pair: sandbox app ids only work on sandbox hosts.
// ~/.claude/skills/clover-api/SKILL.md has the flow and the traps.
const CLOVER_PROD = () => process.env.CLOVER_ENV === "production";
const CLOVER = () => (CLOVER_PROD()
  ? { env: "production", api: "https://api.clover.com", authorize: "https://www.clover.com/oauth/v2/authorize",
      appId: need("CLOVER_PROD_APP_ID"), secret: need("CLOVER_PROD_APP_SECRET") }
  : { env: "sandbox", api: "https://apisandbox.dev.clover.com", authorize: "https://sandbox.dev.clover.com/oauth/v2/authorize",
      appId: need("CLOVER_APP_ID"), secret: need("CLOVER_APP_SECRET") });
const CLOVER_REDIRECT = () => `${SITE}/clover/callback`;

function authorizeUrl(mid) {
  const u = new URL(CLOVER().authorize);
  u.searchParams.set("client_id", CLOVER().appId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", CLOVER_REDIRECT());
  u.searchParams.set("state", sign(mid || "-", 1800));
  return u.toString();
}

async function clover(path, token) {
  const r = await fetch(`${CLOVER().api}${path}`, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json", "User-Agent": UA },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`clover ${path.split("?")[0]}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`); e.status = r.status; throw e; }
  return j;
}

async function oauth(path, body) {
  const r = await fetch(`${CLOVER().api}/oauth/v2/${path}`, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json", "User-Agent": UA },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error(`oauth ${path}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

// Refresh tokens are single-use: the new pair is written to D1 BEFORE it is used for anything.
async function accessToken(row) {
  const t = unseal(row.token_blob);
  if (t.access_token_expiration && t.access_token_expiration * 1000 > Date.now() + 120000) return t.access_token;
  const n = await oauth("refresh", { client_id: CLOVER().appId, refresh_token: t.refresh_token });
  await d1("update merchants set token_blob=?, updated_at=datetime('now') where merchant_id=?",
    [seal({ ...t, ...n }), row.merchant_id]);
  return n.access_token;
}

async function event(mid, kind, detail) {
  try { await d1("insert into events (merchant_id, kind, detail) values (?,?,?)", [mid, kind, String(detail || "").slice(0, 500)]); } catch (_) {}
}

module.exports = { SITE, d1, seal, unseal, sign, verify, setSession, session, CLOVER, CLOVER_REDIRECT,
  authorizeUrl, clover, oauth, accessToken, event, need };

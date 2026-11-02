// GET /clover?merchant_id=…&employee_id=…  — the app's registered Site URL / Alternate Launch Path.
// Where Clover sends a merchant who installs or opens the app. We always run the OAuth code flow from
// here: knowing a merchant id is never enough to see its report; only a code Clover issues is.
const { authorizeUrl, event } = require("../_lib");

module.exports = async (req, res) => {
  try {
    const mid = String(req.query.merchant_id || "").replace(/[^A-Za-z0-9]/g, "");
    await event(mid || null, "launch", req.query.employee_id || "");
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, authorizeUrl(mid));
  } catch (e) {
    console.error("[clover/launch]", e.message);
    res.status(502).send("Could not start from Clover. Please try again in a minute.");
  }
};

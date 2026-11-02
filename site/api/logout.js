module.exports = (req, res) => {
  res.setHeader("Set-Cookie", "tow=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  res.redirect(302, "/");
};

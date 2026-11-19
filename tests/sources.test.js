// Every rule the calculator cites quotes its source verbatim; the quote must be in the copy of that
// source saved in regs/ (fetched 2026-11-19 from the URL in SOURCES). A rule recalled from memory
// and not in the text fails here.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { SOURCES } = require("../site/api/_deduction.js");

const norm = (s) => s.replace(/-\s*\n\s*/g, "").replace(/\s+/g, " ");
for (const [id, s] of Object.entries(SOURCES)) {
  test(`${id} is quoted verbatim from regs/${s.file}`, () => {
    const text = norm(fs.readFileSync(path.join(__dirname, "..", "regs", s.file), "utf8"));
    assert.ok(text.includes(norm(s.quote)), `not found in ${s.file}: ${s.quote}`);
  });
}

#!/usr/bin/env node
// Builds everything that is generated from data/: the occupation table the MCP reads
// (site/api/_occupations.json), the data page (/no-tax-on-tips-by-occupation/), llms.txt,
// llms-full.txt and sitemap.xml. Never hand-edit those outputs; edit this and re-run:
//   node scripts/build_pages.js
// Inputs: data/ttoc_irs_table.json (IRS tipped-occupation table, parsed from irs.gov/tippedoccupations)
//         data/oews_tipped.json (BLS OEWS national wages, scripts/fetch_oews.py)
const fs = require("node:fs");
const path = require("node:path");
const D = require("../site/api/_deduction.js");

const ROOT = path.join(__dirname, "..");
const SITE = "https://tip-overtime-w2.vercel.app";
const TODAY = new Date().toISOString().slice(0, 10);
const table = JSON.parse(fs.readFileSync(path.join(ROOT, "data/ttoc_irs_table.json"), "utf8"));
const oews = JSON.parse(fs.readFileSync(path.join(ROOT, "data/oews_tipped.json"), "utf8"));
const POSTHOG = fs.readFileSync(path.join(__dirname, "posthog.html"), "utf8");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const $ = (n) => (n === null || n === undefined ? "–" : "$" + Math.round(n).toLocaleString("en-US"));
const write = (rel, body) => { const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); console.log(`  ${rel} ${body.length.toLocaleString()} bytes`); };

// One row per Treasury Tipped Occupation Code. When the IRS ties a code to several SOC codes, the pay
// is the related SOC with the most jobs (named in `soc_used`); BLS counts everyone in that SOC, tipped
// or not, so `bls_jobs` is the size of the related occupation, never a count of tipped workers.
const occ = table.map((r) => {
  const socs = r.soc.map((k) => ({ k, ...(oews.soc[k] || {}) })).filter((x) => x.employment).sort((a, b) => b.employment - a.employment);
  const top = socs.find((x) => x.median) || socs[0] || {};
  const w = (p) => (p ? D.worth(p, "single") : null);
  const m = w(top.median);
  return { code: r.ttoc, title: r.title, description: r.description, examples: r.examples, soc: r.soc, soc_used: top.k || null, bls_jobs: top.employment || null,
    p10: top.p10 || null, p25: top.p25 || null, median: top.median || null, p75: top.p75 || null, p90: top.p90 || null,
    per1000: m ? m.per1000 : null, most: m ? m.most : null, most_p10: top.p10 ? w(top.p10).most : null, most_p90: top.p90 ? w(top.p90).most : null };
});
write("site/api/_occupations.json", JSON.stringify(occ) + "\n");

const priced = occ.filter((o) => o.median);
const at12 = priced.filter((o) => o.per1000 === 120).length;
const waiter = occ.find((o) => o.code === "102"), bart = occ.find((o) => o.code === "101");
const maxMost = Math.max(...priced.map((o) => o.most)), minMost = Math.min(...priced.map((o) => o.most));
const ranked = priced; // IRS code order: grouped as the IRS groups them. Sorting by BLS jobs put broad related SOCs (hand laborers for "home movers") on top.
const unpriced = occ.filter((o) => !o.median);
const FACT = `A median waiter (BLS pay ${$(waiter.median)}) saves ${$(waiter.per1000)} of federal income tax for every $1,000 in tips. The most no tax on tips can save them in a year is ${$(waiter.most)}, because that is all the income tax they owe. A waiter in the bottom tenth (${$(waiter.p10)}) can save at most ${$(waiter.most_p10)}.`;
const METHOD = `Pay: BLS Occupational Employment and Wage Statistics, ${oews.reference}, national, all industries (wages include tips). Each Treasury Tipped Occupation Code is matched to its related SOC code from the IRS list; where there are several, the one with the most jobs is used. Tax: 2026 federal rates and the $16,100 standard deduction (Rev. Proc. 2025-32), single filer, no other income, before credits. "Per $1,000" is the tax on the last $1,000 of taxable income. "Most it can save" assumes $25,000 of the pay (or all of it, if less) is qualified tips: it is the ceiling, not a typical figure. Social Security and Medicare tax (7.65%) and state income tax are not reduced by this deduction.`;

const rowsHtml = ranked.map((o) => `<tr><td><b>${esc(o.title)}</b><small>${o.code} · SOC ${o.soc_used}</small></td><td>${$(o.median)}</td><td>${$(o.per1000)}</td><td><b>${$(o.most)}</b></td><td class="wide">${$(o.most_p10)}</td><td class="wide">${$(o.most_p90)}</td></tr>`).join("\n");
const ld = { "@context": "https://schema.org", "@type": "Dataset", name: "What the no-tax-on-tips deduction is worth, by tipped occupation", description: FACT, url: SITE + "/no-tax-on-tips-by-occupation/",
  dateModified: TODAY, temporalCoverage: "2026", creator: { "@type": "Organization", name: "Brick and Mortar AI LLC" }, license: "https://opensource.org/licenses/MIT",
  isBasedOn: ["https://www.irs.gov/tippedoccupations", "https://www.bls.gov/oes/", "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf"],
  distribution: { "@type": "DataDownload", encodingFormat: "text/plain", contentUrl: SITE + "/llms-full.txt" } };

const head = (title, desc, canon) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><link rel="stylesheet" href="/style.css"><script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)}</script><script defer src="/_vercel/insights/script.js"></script>
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${canon}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${canon}">
${POSTHOG}</head>`;

write("site/public/no-tax-on-tips-by-occupation/index.html", `${head("No tax on tips: what it's worth, job by job (2026)", FACT, SITE + "/no-tax-on-tips-by-occupation/")}
<body><div class="wrap">
<header class="top"><a class="brand" href="/worksheet/">Tip &amp; Overtime Deductions</a><a class="small" href="/worksheet/">Work out yours</a></header>
<section class="hero">
<span class="due">Updated ${TODAY} · BLS pay ${esc(oews.reference)} · 2026 tax rates</span>
<h1>No tax on tips saves a median waiter ${$(waiter.per1000)} per $1,000 in tips.</h1>
<p class="lede">At most ${$(waiter.most)} a year, not $25,000. The $25,000 is the cap on tips you can deduct; what it saves is the income tax on them. For ${at12} of the ${priced.length} tipped jobs BLS prices, a median earner is in the 12% bracket.</p>
</section>
<div class="card" id="try"><h3>Your number</h3>
<div class="pair"><label>Your pay for the year, tips included<input id="pay" inputmode="decimal" placeholder="35,000"></label><label>Tips in it<input id="tips" inputmode="decimal" placeholder="12,000"></label></div>
<label>Filing status<select id="st"><option value="single">Single</option><option value="hoh">Head of household</option><option value="mfj">Married filing jointly</option><option value="mfs">Married filing separately</option></select></label>
<p id="out" class="lede" aria-live="polite">Type your pay and tips.</p>
<a class="btn primary" id="full" href="/worksheet/">Do the full worksheet (overtime, W-2 boxes) →</a>
</div>
<div class="listhead"><h2>By tipped occupation</h2><span class="note">In IRS code order. Single filer, 2026.</span></div>
<div class="scroll"><table class="occ"><thead><tr><th>Occupation · code</th><th>Median pay</th><th>Saves per $1,000 tips</th><th>Most it can save</th><th class="wide">Most, bottom tenth</th><th class="wide">Most, top tenth</th></tr></thead><tbody>
${rowsHtml}
</tbody></table></div>
<p class="note">Not priced by BLS as annual pay (hourly only): ${unpriced.map((o) => esc(o.title) + " (" + o.code + ")").join(", ")}.</p>
<section class="prose"><h2>How this was worked out</h2><p>${esc(METHOD)}</p>
<p>The range across occupations: the most it can save a median earner runs from ${$(minMost)} to ${$(maxMost)}. A median bartender (${$(bart.median)}) saves ${$(bart.per1000)} per $1,000 and at most ${$(bart.most)}.</p>
<p>Sources: <a href="https://www.irs.gov/tippedoccupations">IRS list of tipped occupations</a> (codes, related SOC codes) · <a href="https://www.bls.gov/oes/">BLS OEWS</a> (pay, via the BLS public API) · <a href="https://www.irs.gov/pub/irs-drop/rp-25-32.pdf">Rev. Proc. 2025-32</a> (2026 rates) · <a href="https://www.law.cornell.edu/uscode/text/26/224">26 U.S.C. § 224</a> (the deduction). Machine-readable: <a href="/llms-full.txt">llms-full.txt</a>. Code: <a href="https://github.com/2016judea/tip-overtime-w2">github.com/2016judea/tip-overtime-w2</a>.</p></section>
</div>
<footer><div class="wrap">Tip &amp; Overtime Deductions, by Brick &amp; Mortar. We calculate and show the math; nothing is filed or stored. · <a href="/ai/">Use it in Claude or ChatGPT</a> · <a href="/privacy/">Privacy</a></div></footer>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script src="/js/deduction.js"></script>
<script>
(function(){var D=window.W2Deduction,f=function(v){return Number(String(v||"").replace(/[$,\\s]/g,""))||0};
function go(){var pay=f(document.getElementById("pay").value),tips=f(document.getElementById("tips").value),st=document.getElementById("st").value,o=document.getElementById("out");
if(!pay&&!tips){o.textContent="Type your pay and tips.";return;}
var r=D.compute({tax_year:2026,filing_status:st,agi:pay,jobs:[{box12_tp:tips}]});
if(st==="mfs"){o.textContent="Married filing separately: no deduction. Filing jointly is the only way to claim it.";return;}
o.innerHTML="Deduction <b>"+D.usd(r.tips.deduction_cents)+"</b>. Federal income tax saved, about <b>"+(r.saved?D.usd(r.saved.cents):"$0.00")+"</b>.";
try{if(!go.sent){go.sent=1;window.posthog&&posthog.capture("worth_tried",{status:st});}}catch(e){}}
["pay","tips","st"].forEach(function(id){document.getElementById(id).addEventListener("input",go)});})();
</script>
</body></html>
`);

const llms = `# Tip & Overtime Deductions

> Works out the federal "no tax on tips" and "no tax on overtime" deductions (Schedule 1-A, Form 1040, tax years 2025-2028) and the new 2026 W-2 boxes (box 12 TP, TT; box 14b), in code, with every Schedule 1-A line and a citation for every rule. Free. Calculates and shows; files nothing; stores nothing.

${FACT}

- [Worksheet](${SITE}/worksheet/): fill in W-2 box 12 TP/TT (or pay stubs), filing status and AGI; get both deductions line by line, printable for a preparer.
- [What no tax on tips is worth, by tipped occupation](${SITE}/no-tax-on-tips-by-occupation/): BLS ${oews.reference} pay for all 71 IRS tipped occupations, federal tax saved per $1,000 of tips and the most it can save in a year.
- [Full data and rules as text](${SITE}/llms-full.txt)
- [MCP connector](${SITE}/ai/): Streamable HTTP at ${SITE}/mcp, no auth. Tools: tip_overtime_deduction, w2_tip_overtime_boxes, tipped_occupation_code.
- [For Clover merchants](${SITE}/): every employee's 2026 TP, TT and 14b from the register.
- [Source code](https://github.com/2016judea/tip-overtime-w2), MIT.
`;
write("site/public/llms.txt", llms);

const RULES = [
  ["Tips cap", "Up to $25,000 of qualified tips per return, any filing status.", "26 U.S.C. § 224(b)(1); 26 CFR 1.224-1(b)(1)"],
  ["Overtime cap", "Up to $12,500 of qualified overtime ($25,000 on a joint return).", "26 U.S.C. § 225(b)(1)"],
  ["Phase-out", "Each deduction falls by $100 for every full $1,000 of MAGI over $150,000 ($300,000 joint). Schedule 1-A rounds the thousands DOWN.", "§ 224(b)(2), § 225(b)(2); Schedule 1-A (2026 draft) lines 13 and 25"],
  ["Married filing separately", "No deduction. Married couples must file jointly.", "§ 224(f), § 225(e)"],
  ["Social Security number", "Required, valid for work.", "§ 224(e), § 225(d)"],
  ["Years", "Tax years 2025 through 2028.", "§ 224(h), § 225(g)"],
  ["Qualified tips", "Voluntary cash or card tips (incl. tip pools) in an occupation on the IRS list. Service charges and automatic gratuities are not tips, even when paid to staff.", "§ 224(d); 26 CFR 1.224-1(c)(4); irs.gov/tippedoccupations"],
  ["Qualified overtime", "Only the FLSA-required premium: hours over 40 in a workweek x 0.5 x the regular rate. Not double time's extra half, not daily or weekend premiums, nothing for FLSA-exempt staff.", "§ 225(c)(1); 2026 W-2 instructions code TT; Notice 2025-69"],
  ["Where it goes (2026)", "Schedule 1-A Part II (tips, line 15) and Part III (overtime, line 27); total to Form 1040 line 13a. You can take it with the standard deduction.", "Schedule 1-A and Form 1040, 2026 drafts"],
  ["Where it goes (2025)", "Schedule 1-A lines 13 and 21; total via line 38 to Form 1040 line 13b.", "Schedule 1-A (2025)"],
  ["W-2 (2026)", "Box 12 code TP = cash tips reported to the employer; code TT = qualified overtime; box 14b = up to two Treasury Tipped Occupation Codes, 000 if any tips came in an unlisted occupation.", "2026 General Instructions for Forms W-2 and W-3"],
  ["Not reduced", "Social Security and Medicare tax, and state income tax unless the state follows.", "§ 224, § 225 are income tax deductions only"],
  ["Pay-stub estimates (before the W-2)", "Total overtime pay at 1.5x / 3; at 2x / 4; a stated 1.5x premium as is; a stated 2x premium / 2.", "Notice 2025-69, methods A-D"],
];
const full = `${llms}
## The rules (each with its source)

${RULES.map(([a, b, s]) => `- ${a}: ${b} [${s}]`).join("\n")}

## What no tax on tips is worth, by Treasury Tipped Occupation Code

${METHOD}

code | occupation | related SOC used | BLS jobs in that SOC (tipped or not) | p10 pay | median pay | p90 pay | saved per $1,000 tips at median | most it can save at p10 | at median | at p90
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
${occ.map((o) => [o.code, o.title, o.soc_used || o.soc.join(" "), o.bls_jobs ? o.bls_jobs.toLocaleString("en-US") : "–", $(o.p10), $(o.median), $(o.p90), $(o.per1000), $(o.most_p10), $(o.most), $(o.most_p90)].join(" | ")).join("\n")}

Pay source: ${oews.source}, ${oews.reference}; series ${oews.series_pattern} at ${oews.api}. Built ${TODAY}.
`;
write("site/public/llms-full.txt", full);

const pages = ["/", "/worksheet/", "/no-tax-on-tips-by-occupation/", "/ai/", "/privacy/", "/terms/"];
write("site/public/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${SITE}${p}</loc><lastmod>${TODAY}</lastmod></url>`).join("\n")}
</urlset>
`);
console.log(`${occ.length} occupations, ${priced.length} priced, ${at12} at $120 per $1,000 at the median`);

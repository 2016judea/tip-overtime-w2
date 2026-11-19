# Tip & Overtime W-2s

**Live:** https://tip-overtime-w2.vercel.app

Works out the federal **"no tax on tips"** and **"no tax on overtime"** deductions, and the new 2026
Form W-2 boxes behind them, in code, with the math shown and a citation for every rule. Two people
ask the question, so it has two front doors:

- **The person asking an AI** (since 2026-11-19). A worker says "how much of my tips and overtime can
  I deduct?" to Claude or ChatGPT. The connector at **`https://tip-overtime-w2.vercel.app/mcp`**
  works it out from their W-2 boxes or pay stubs, line by line on Schedule 1-A, and hands back a
  link that opens the filled-in [worksheet](https://tip-overtime-w2.vercel.app/worksheet/) to print
  or give to a preparer. A bookkeeper pastes payroll rows and gets each employee's box 12 TP, TT and
  box 14b. Setup: [/ai/](https://tip-overtime-w2.vercel.app/ai/).
- **The owner on Clover.** A Clover app that reads the register and gives every employee's W-2
  figures. Unchanged; described from "How it works" down.

And one page of numbers nobody else publishes:
[what no tax on tips is worth, by tipped occupation](https://tip-overtime-w2.vercel.app/no-tax-on-tips-by-occupation/)
(BLS OEWS May 2025 pay for all 71 IRS tipped occupations, run through the 2026 tax tables: a median
waiter saves $120 per $1,000 of tips and at most $2,048 a year).

**It calculates and shows. Nobody here files anything, and the connector stores nothing it is sent.**

## The connector (MCP)

Streamable HTTP, stateless, no auth: `site/api/mcp.js`, rewritten from `/mcp`.

| Tool | For | Computes with |
|---|---|---|
| `tip_overtime_deduction` | a worker: W-2 box 12 TP/TT/14b, Form 4137, 1099s, or pay stubs → both deductions, every Schedule 1-A line, the Form 1040 line, federal tax saved, flags, citations, worksheet link | `site/api/_deduction.js` |
| `w2_tip_overtime_boxes` | an owner or bookkeeper: one row per employee per workweek → TP, TT, 14b per employee, each overtime week's regular rate, printable sheet link | `site/api/_payroll.js` → the Clover engine `site/api/_engine.js` |
| `tipped_occupation_code` | "does my job qualify?": the TTOC for a job title, its IRS description, BLS median pay, what the deduction is worth there | `site/api/_occupations.json` |

A model is never the source of a number: the assistant passes figures in and carries the answer out.

**Privacy, by design.** The worksheet link carries the figures in the URL **fragment**
(`/worksheet/?src=mcp#w1.<base64 JSON>`). Browsers never send a fragment to a server, so the figures
never reach Vercel's logs. The page's first script copies the fragment into memory and deletes it
from the address bar *before* PostHog or Vercel Analytics load, so they see only `/worksheet/?src=mcp`.
A short-lived server token was the alternative and was rejected: it means storing the figures.
Employer labels are dropped from the link; nothing is written to storage.

**Analytics.** Each call sends one PostHog `mcp_tool_call` event: `tool`, `ok`, `ms`, `client`,
`client_ua`, and coarse booleans (`has_tips`, `has_ot`, `source` w2/estimate, `year`, `blocked`;
`employees` count for the owner tool). Never an amount, a name or an argument, and no IP: claude.ai
connector calls arrive from Anthropic's servers, so an IP-based id counts servers, not people
(`distinct_id` is a fresh random id per call). **People are counted on the web side**: PostHog
pageviews whose `$current_url` contains `src=mcp`, plus `worksheet_opened` (`prefilled`
worker/owner/none, `src`), `worksheet_computed`, `worksheet_printed`, `worth_tried`,
`connector_url_copied`. Mark a test call with header `x-tow-test: 1`.

## The rules, verified 2026-11-19 from primary sources

Copies of every source are in `regs/` and `tests/sources.test.js` checks that each rule the code
quotes is verbatim in its copy.

| Rule | Source |
|---|---|
| Tips: up to $25,000 per return, any filing status | 26 U.S.C. § 224(b)(1); 26 CFR 1.224-1(b)(1) (T.D. 10044, 91 FR 19026, Apr. 13 2026) |
| Overtime: up to $12,500, $25,000 joint | § 225(b)(1) |
| Each falls $100 per full $1,000 of MAGI over $150,000 ($300,000 joint); thousands round DOWN | § 224(b)(2), § 225(b)(2); Schedule 1-A 2026 draft lines 13, 25 (2025: lines 11, 19) |
| Married filing separately: nothing. SSN valid for work required | § 224(e)-(f), § 225(d)-(e) |
| Tax years 2025-2028 | § 224(h), § 225(g) |
| Qualified tips: voluntary, in an occupation on the IRS list (71 codes); service charges and automatic gratuities never count | § 224(d); 1.224-1(c)(4); irs.gov/tippedoccupations |
| SSTB exclusion not enforced for listed occupations until final SSTB regs (reserved in 1.224-1(g)) | Notice 2025-69 |
| Qualified overtime: only the FLSA half (hours over 40 × 0.5 × regular rate) | § 225(c)(1); 2026 W-2 instructions, code TT |
| Pay-stub estimates: total at 1.5x ÷ 3, at 2x ÷ 4; stated premium ×1 or ÷2 | Notice 2025-69 methods A-D (Examples 1-4 are unit tests) |
| 2026 lines: tips per employer on line 4 (larger of box 12 TP and Form 4137 line 1 col c), deduction line 15; overtime line 16 (box 12 TT), deduction line 27; total to Form 1040 line 13a | Schedule 1-A and Form 1040 2026 **drafts** (6/16/26, 8/19/26): line numbers can still move |
| 2026 rates and standard deduction ($16,100 single) for the tax-saved estimate | Rev. Proc. 2025-32 |

## How the Clover app works

1. A merchant installs from the Clover App Market (or opens it from their dashboard). Clover sends
   them to `/clover` (`site/api/clover/launch.js`), which starts OAuth v2. `/clover/callback`
   exchanges the code, seals the token pair (AES-256-GCM) into Cloudflare D1, and sets a 12-hour
   signed session cookie.
2. `/report/` calls `/api/data`. That reads the year from Clover in 85-day windows (the API caps a
   time filter at 90 days): employees, shifts, and payments with `expand=tender,order,employee,refunds,serviceCharge`.
   Refresh tokens are single-use and are rotated and saved before use. `site/api/_clover.js` maps the
   rows to the engine's input.
3. **The engine** (`site/api/_engine.js`) is pure, deterministic JavaScript with no model and no
   network. The browser runs the same file, so every answer the owner gives recomputes instantly.
   Answers save to D1 (`/api/answers`).
4. Anything Clover can't tell us is asked, with a visible default, and flagged until confirmed: pay
   rates, exempt status, workweek start, tip credit, tip sharing done off the register, bonuses,
   whether service charges go to staff, and occupation codes. `DATA_MODEL.md` has the field-by-field
   check.
5. Download CSV: the W-2 figures, every workweek, every tip row.

## The Clover engine's rules, and where they come from

Cited in code where applied (`site/api/_engine.js` header):

- IRS, [2026 General Instructions for Forms W-2 and W-3](https://www.irs.gov/instructions/iw2w3): codes TP and TT, Box 14b (up to two codes; "000" if any tips came from a nonqualifying occupation).
- IRS [FS-2026-13](https://www.irs.gov/pub/taxpros/fs-2026-13.pdf), Q10–Q17: per-workweek formula, fixed recurring workweek with no averaging, regular rate = all remuneration ÷ FLSA hours, only the FLSA half counts (Q16 worked example is a unit test).
- IRS [tipped occupations list](https://www.irs.gov/tippedoccupations), transcribed to `site/api/_ttoc.js`.
- DOL Fact Sheets [#15](https://www.dol.gov/agencies/whd/fact-sheets/15-tipped-employees-flsa) (tip credit: OT on the full minimum wage; service charges are not tips but are wages in the regular rate), [#23](https://www.dol.gov/agencies/whd/fact-sheets/23-flsa-overtime-pay), [#56A](https://www.dol.gov/agencies/whd/fact-sheets/56a-regular-rate).

One judgment call: workweeks hold the owner's **local** start (Sunday 00:00 stays Sunday 00:00 all
year), so the two weeks with a DST change run 167 and 169 hours. Stepping a strict 168 hours put
summer boundaries at 01:00 and moved a Saturday-night hour into the wrong week in the sandbox run.

## Tests

    npm test                      # 61: engine (18), deduction (15), sources verbatim (22), MCP (6)
    python3 scripts/fetch_oews.py # BLS OEWS May 2025 pay for every related SOC (needs BLS_API_KEY)
    node scripts/build_pages.js   # → _occupations.json, the by-occupation page, llms(-full).txt, sitemap
    python3 scripts/indexnow.py   # ping Bing/IndexNow with every sitemap URL after a deploy
    node scripts/check_sandbox.js # live pull from the sandbox merchant vs. hand-worked figures (3/3)

## Clover

Tool skill: `~/.claude/skills/clover-api/SKILL.md`. Developer account and sandbox test merchant
`4ZNNY5AK5SNT1` are shared with Block Brief.

- **Sandbox app** `VRS0YGB8BCFY2` (NA sandbox, Private + Web). Read: Employees, Merchant, Orders,
  Payments. Site URL `https://tip-overtime-w2.vercel.app/clover`, launch path `/clover`, OAuth Code.
  Secret in `.env` and Vercel (`CLOVER_APP_ID`, `CLOVER_APP_SECRET`, `CLOVER_ENV=sandbox`).
- **Proved end to end on 2026-11-02:** install from the sandbox App Market → Open the app → `/clover`
  → OAuth → `/clover/callback` → `/report/` showing 28 shifts and 7 payments. Then pay rates were
  entered in the page. TP $353.00, TT $205.50, and every employee's figures match the hand-worked
  ones. Answers persisted across a reload. The final install held READ permissions only. Seeding
  (`scripts/seed_sandbox.js`) briefly needed WRITE, which was removed and the app reinstalled.
- **Production:** the developer account is verifying (Aidan's ID documents, ~11/14). Listing copy,
  permission reasons, icon, cover, screenshots and the walkthrough video are in `listing/`.

## Running it

    set -a; . ~/Desktop/workspace/bricks/.env; set +a   # VERCEL_TOKEN
    node scripts/make_sample.js               # rebuild the SAMPLE café
    python3 scripts/deploy.py                 # Vercel over REST (copies the engine to public/js first)
    python3 scripts/vercel_env.py KEY…        # push .env keys to Vercel

`.env` (gitignored): `ACCESS_SECRET`, `CLOUDFLARE_API_TOKEN`, `CLOVER_ENV`, `CLOVER_APP_ID`,
`CLOVER_APP_SECRET` (later `CLOVER_PROD_APP_ID`, `CLOVER_PROD_APP_SECRET`). D1 database
`tip-overtime-w2` (`2bfd0140-…`), Vercel project `prj_z2TmV6xcMppgVzpzIPamqulmcWn3`, Web Analytics on.

## Price

Draft: one tier, **$29/month**, billed by Clover. Not set live. An owner installs in December,
runs it in January, and can uninstall after W-2s go out, so the season costs about $58. That is
less than an hour of an accountant rebuilding the same figures by hand, and the same price as
Block Brief on the same marketplace.

## Expectation (written 2026-11-19, before the connector was listed anywhere)

The read is **2027-02-26**, four weeks after W-2s are due (Jan 31) and seven before filing ends
(Apr 15). Second read 2027-04-16.

- **Base rates.** heistclips' connector sent 151 people to its site via `src=mcp` links in
  11/16-11/19 (54% used it), where people already ask an AI the exact question. The Brick & Mortar
  business connector, same channel, got zero human calls in 7 days. Directory review for both
  Claude and ChatGPT has taken weeks; until a listing is live, the only way in is the custom URL
  or the data page being cited.
- **Expected:** 40 people landing on `/worksheet/?src=mcp` by 2027-02-26, and 30 more arriving at
  the by-occupation page from search or AI citations. Most of it depends on a directory listing
  being live by mid-January.
- **Would surprise us upward:** more than 300 `src=mcp` people by the read date. That would mean
  the filing-season question pulls through the directories the way the clipping question did.
- **Would surprise us downward:** zero `src=mcp` people with a directory listing live for 30 days.
  That would mean assistants answer this from their own knowledge and never call a tool (the
  business-connector pattern), and the page is the only channel.
- **Count with:** PostHog, `$host` tip-overtime-w2.vercel.app, pageviews where `$current_url`
  contains `src=mcp`, unique persons; `mcp_tool_call` counts calls, not people.

## Licence

MIT.

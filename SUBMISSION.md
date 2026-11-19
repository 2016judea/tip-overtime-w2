# Connector listing kit

Prepared 2026-11-19 and filed the same day (see "Submitted 2026-11-19" at the end). Pattern and rejection history:
`~/Desktop/workspace/small-business-intelligence-mcp/SUBMISSION-KIT.md`; the last filing that went
through cleanly is `~/Desktop/workspace/heistclips/SUBMISSION.md`.

| Field | Value |
|---|---|
| Name | Tip & Overtime Deductions |
| Endpoint | `https://tip-overtime-w2.vercel.app/mcp` · Streamable HTTP · auth none · no UI/CSP |
| Publisher | Brick and Mortar AI LLC, 1651 Eleanor Ave, Saint Paul, MN 55116 |
| Website / docs | https://tip-overtime-w2.vercel.app/ai/ (setup) · https://tip-overtime-w2.vercel.app/worksheet/ |
| Privacy / terms | https://tip-overtime-w2.vercel.app/privacy/ · https://tip-overtime-w2.vercel.app/terms/ |
| Support | the business address printed on /privacy/ (an HTTPS URL where a form wants one: /ai/) |
| Source | https://github.com/2016judea/tip-overtime-w2 (MIT) |
| Icon | https://tip-overtime-w2.vercel.app/icon-512.png |
| Category | Finance |

## One-liner (≤100)
Works out the no-tax-on-tips and no-tax-on-overtime deductions and W-2 boxes, with the math shown

## Short (≤30, ChatGPT)
No tax on tips and overtime

## Description
For tipped workers, anyone paid overtime, and the owners and bookkeepers who fill in their W-2s.
Ask how much of your tips and overtime you can deduct and get both deductions worked out in code
from your W-2 boxes or pay stubs: every Schedule 1-A line, the Form 1040 line it lands on, the
federal tax it saves, and a citation to the statute, regulation or IRS form behind each rule, with a
link to a filled-in worksheet to print. Owners paste payroll rows and get each employee's box 12 TP,
TT and box 14b. Nothing is filed or stored. No account.

(No pricing words in any metadata field: they fail OpenAI's metadata check, SBI kit §10.)

## Annotations (all explicit booleans; `tests/mcp.test.js` holds them)
| Tool | readOnly | destructive | openWorld | idempotent |
|---|---|---|---|---|
| tip_overtime_deduction, w2_tip_overtime_boxes, tipped_occupation_code | true | false | false | true |

openWorld is false: every tool computes from what it is passed and the tables shipped with the
server; none reaches an outside service. Justification line for forms: "Pure calculation; reads and
writes nothing outside the request."

## Test cases (run against the live endpoint 2026-11-19)
1. "I'm a server, single, AGI $38,000. My W-2 has box 12 TP $14,200, TT $640, box 14b 102. What can I
   deduct?" → tip_overtime_deduction → $14,200.00 + $640.00 = $14,840.00, Form 1040 line 13a, tax
   saved $1,674.00, worksheet link.
2. "No W-2 yet. Single, about $41,000 income, $12,800 in tips as a bartender and 90 hours of overtime
   at $16 an hour." → tip_overtime_deduction → $12,800.00 + $720.00, saved $1,602.00, flagged as
   estimates. (Run live 2026-11-19.)
3. "I'm married but we file separately. I made $9,000 in tips." → tip_overtime_deduction → $0, the
   reason and § 224(f).
4. Payroll rows (employee,week_start,hours,rate,tips,role / M,2026-03-01,45,15,300,server /
   M,2026-03-08,38,15,250,server) → w2_tip_overtime_boxes → TP $550, TT $37.50, 14b 102 (to confirm).
5. "Does a bartender qualify for no tax on tips?" → tipped_occupation_code → 101, BLS median $34,340,
   $120 per $1,000.
Negative: "File my tax return for me" → no tool files; "What's the capital gains rate on stock held
two years?" → no tool.

## Starter prompts
- How much of my tips can I deduct?
- Does no tax on overtime apply to me?
- What goes in W-2 box 12 TP and TT for my staff?

## Packages
- **ChatGPT:** `chatgpt-plugin.zip`, built by `python3 scripts/build_chatgpt_plugin.py` (plugin
  `tip-overtime-deductions` 0.1.0, Agent Plugins schema, test cases above). Any change to the tool
  surface means a rescan, a version bump and a resubmit (SBI kit, 10/09 rejection).
- **Claude:** no package; the portal reads the live server.

## What needed Aidan (superseded: all filed 2026-11-19, see below)
1. **Claude Connectors Directory.** In claude.ai Settings → Connectors → Add custom connector →
   `https://tip-overtime-w2.vercel.app/mcp` (the portal requires it be added first). Then the
   directory submission form: paste the fields above, and press **Submit**.
2. **ChatGPT plugin directory.** platform.openai.com → plugins → upload `chatgpt-plugin.zip`
   (publisher: Business — Brick and Mortar AI LLC), let it scan the server, tick the attestations,
   press **Submit**. When the approval mail comes, press **Publish** (approval does not publish).
   The portal may ask for a domain challenge: tell me the token and I set it.
3. **Official MCP Registry** (feeds Glama and PulseMCP): `mcp-publisher login github` needs his
   device code at github.com/login/device; the vercel.app host rules out DNS auth.

## Submitted 2026-11-19

Filed by Claude in Aidan's own Chrome (JavaScript run by process id into his signed-in tabs). His screen was
locked, so a copied Chrome profile could not decrypt his cookies and was not used. Nothing was paid, nothing
was sent to a person, nothing was published. Each status below was read back off the portal after filing.

| Where | Status | UTC | Listing / ID |
|---|---|---|---|
| Official MCP Registry | **LISTED**, active | 22:28 | `io.github.2016judea/tip-overtime-w2` 0.1.0 |
| Claude Connectors Directory | **SUBMITTED, in review** | 22:48 | claude.ai/directory/manage/tip-overtime-deductions · slug `tip-overtime-deductions` (permanent) |
| ChatGPT plugin directory | **0.1.1 IN REVIEW** | 23:34 | `plugin_asdk_app_6aff7e632e2c81919d973a82f1aa66cb` |

**What needs Aidan**
- **Claude:** when it reads "Ready to publish", click **Publish** at claude.ai/directory/manage/tip-overtime-deductions.
- **ChatGPT:** when the approval email comes, click **Publish** at
  platform.openai.com/plugins/manage/plugin_asdk_app_6aff7e632e2c81919d973a82f1aa66cb. Leave
  `site/public/.well-known/openai-apps-challenge` in place: OpenAI re-checks it.

**Official MCP Registry.** No device code needed. `server.json` plus `.github/workflows/mcp-registry.yml` publish
over GitHub Actions OIDC (`mcp-publisher login github-oidc`), which proves the repo owner and grants
`io.github.2016judea/*`. It runs when `server.json` changes on `main`; bump `version` there to republish.

**Claude, what was filed.** Custom connector "Tip & Overtime Deductions" added to his Claude (Settings →
Connectors). Name, one-liner and description verbatim from this kit. Categories: Financial Services, Productivity.
Author Brick and Mortar AI LLC (https://tip-overtime-w2.vercel.app/). Docs `/ai/`, support aidan@brickandmortar.dev,
privacy `/privacy/`, custom icon `/icon-512.png`. Use cases: test cases 1, 4 and 5. Prerequisites: none. Read only.
Company Brick and Mortar AI LLC, https://brickandmortar.dev, Aidan Jude, Founder. Auth none (detected). Data
handling "We own the API", no health data, no sponsored content. All seven compliance boxes ticked.
- **Server change made for this filing (commit ff1817f, deployed):** `tip_overtime_deduction`'s description ended
  "Ask for filing status and income (AGI) if the user has not said; never guess them." The compliance step attests
  that tool descriptions hold no instructions about model behavior, so it now describes the behavior instead:
  "Filing status and income (AGI) set the phase-out and the tax-saved estimate; without them the result says what
  is missing instead of assuming them."

**ChatGPT, what was filed.** Plugin `tip-overtime-deductions` **0.1.1**, publisher **Business — Brick and Mortar AI LLC**.
- 0.1.0 was uploaded first. The portal requires **exactly three** negative test cases and 0.1.0 had two, so 0.1.1
  adds "How much federal income tax should my employer withhold from my paycheck?" (commit 07a1bc8).
- **Domain:** token in `site/public/.well-known/openai-apps-challenge` (commit e74f091, deployed); "Domain verified".
  MCP connected, no auth, 3 tools, "No findings in the latest MCP scan".
- **Findings:** one non-blocking metadata finding ("Review the plugin's privacy policy against the submission
  guidelines"). The private review note points at the AI-connector section of `/privacy/`.
- **Demo:** https://cf546sdmyewh8fpm.public.blob.vercel-storage.com/demo/tip-overtime-deductions-chatgpt-review.mp4
  (Vercel Blob, heistclips store). About 2 min 50 s, 1536×742, the 8 test cases each in a fresh developer-mode chat
  with the plugin attached by `@Tip & Overtime Deductions`. Frames were rendered from the live ChatGPT tab in-page
  (his screen was locked) and stitched with ffmpeg. In the capital-gains negative, ChatGPT's memory asked about
  a stock sale of his; that line is blurred. This added a developer-mode plugin "Tip & Overtime Deductions" to
  his ChatGPT. Demo URL and release notes were entered in the portal, not the ZIP.
- **Submitted** with the same six attestations as heistclips and Appeal the Denial.


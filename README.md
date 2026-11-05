# Tip & Overtime W-2s

**Live:** https://tip-overtime-w2.vercel.app

A Clover app for small tipped businesses (cafés, restaurants, bars, salons). It reads the owner's
Clover register and works out, for every employee, the three new 2026 Form W-2 figures, with the
math shown:

- **Box 12 code TP**: cash tips reported to the employer. That is card + cash + tips shared in, minus
  tips shared out. Mandatory service charges are excluded and listed separately.
- **Box 12 code TT**: qualified overtime. For each FLSA workweek: hours over 40 × ½ × the regular
  rate. Only the FLSA-required half counts, even when double time is paid.
- **Box 14b**: Treasury Tipped Occupation Code(s), suggested from the employee's role and
  confirmed by the owner.

**It calculates and shows. The owner or their accountant files.** Nothing is ever sent to the IRS
or SSA. W-2s for 2026 are due January 31, 2027.

The landing page shows a labelled **SAMPLE**: Larkspur Café, a fictional business with a synthetic
register (`scripts/make_sample.js`).

## How it works

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

## The rules, and where they come from

Cited in code where applied (`site/api/_engine.js` header):

- IRS, [2026 General Instructions for Forms W-2 and W-3](https://www.irs.gov/instructions/iw2w3): codes TP and TT, Box 14b (up to two codes; "000" if any tips came from a nonqualifying occupation).
- IRS [FS-2026-13](https://www.irs.gov/pub/taxpros/fs-2026-13.pdf), Q10–Q17: per-workweek formula, fixed recurring workweek with no averaging, regular rate = all remuneration ÷ FLSA hours, only the FLSA half counts (Q16 worked example is a unit test).
- IRS [tipped occupations list](https://www.irs.gov/tippedoccupations), transcribed to `site/api/_ttoc.js`.
- DOL Fact Sheets [#15](https://www.dol.gov/agencies/whd/fact-sheets/15-tipped-employees-flsa) (tip credit: OT on the full minimum wage; service charges are not tips but are wages in the regular rate), [#23](https://www.dol.gov/agencies/whd/fact-sheets/23-flsa-overtime-pay), [#56A](https://www.dol.gov/agencies/whd/fact-sheets/56a-regular-rate).

One judgment call: workweeks hold the owner's **local** start (Sunday 00:00 stays Sunday 00:00 all
year), so the two weeks with a DST change run 167 and 169 hours. Stepping a strict 168 hours put
summer boundaries at 01:00 and moved a Saturday-night hour into the wrong week in the sandbox run.

## Tests

    npm test                      # 18 engine tests: IRS/DOL worked examples + edges
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

## Licence

MIT.

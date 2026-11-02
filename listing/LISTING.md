# Clover App Market listing — ready to paste

Drafted 2026-11-02. Nothing here is submitted. The production developer account is still
verifying, and Submit needs it approved (`~/.claude/skills/clover-api/SKILL.md`, "Order of gates":
verify → bank → paid tier → Submit).

## App name
Tip & Overtime W-2s

## Tagline (short description)
Every employee's 2026 W-2 tip and overtime figures, from your Clover, with the math shown.

## Description
New for 2026: every W-2 needs each employee's tips (Box 12, code TP), their qualified overtime
(Box 12, code TT) and a tipped occupation code (Box 14b). Your Clover already holds most of what
goes into them.

Open the app and it reads your 2026 register, read-only: who worked when, the cash tips staff
declared at clock-out, and every tip and service charge on a payment. It works out, for every
employee:

- TP: card tips + cash tips + tips shared in, minus tips shared out. Service charges and
  auto-gratuity are left out, because they are not tips, and are listed separately.
- TT: for each workweek, hours over 40 × ½ × the regular rate, which is only the half the IRS counts,
  even if you pay double time.
- 14b: the occupation code, suggested from the employee's role, for you to confirm.

Every figure shows the math: each workweek's hours, the pay that sets the rate, and the register
rows behind each tip. Clover doesn't hold pay rates, exempt status, your workweek's start day,
tip sharing done off the register, or bonuses, so the app asks for them. Each has a default you
can see, and every figure that rests on an unconfirmed answer is flagged. Download it all as a CSV
for your payroll provider or accountant.

We calculate and show the math. You or your accountant file. Nothing is ever sent to the IRS or SSA.

## Merchant benefits (3, ≤100 chars each)
- Every employee's Box 12 TP, Box 12 TT and Box 14b, worked out from your own register
- See the math: each workweek's hours, regular rate and qualified overtime, row by row
- Service charges kept out of tips automatically, and every open question flagged

## Categories
Employees / Staff management; Reporting & Analytics (pick the closest Clover offers)

## Requested permissions — one reason each
- Employees (Read): names and roles to list each employee; their shifts' clock-in/out times and
  declared cash tips, to count hours per workweek and cash tips.
- Payments (Read): each payment's tip, tender, refunds and service charge, to total card and cash
  tips and to keep service charges out of them.
- Orders (Read): the employee on the order, so a tip belongs to the server even when someone else
  ran the card.
- Merchant (Read): business name and time zone, so workweeks start at your local day and hour.

## URLs
- Site URL (REST): https://tip-overtime-w2.vercel.app/clover   (Alternate Launch Path: /clover)
- Website: https://tip-overtime-w2.vercel.app
- Privacy policy: https://tip-overtime-w2.vercel.app/privacy/
- Terms of service: https://tip-overtime-w2.vercel.app/terms/
- Support email: aidan@brickandmortar.dev
- Support phone: (Aidan's, not on disk — fill in)

## Images (this folder)
- icon-512.png, icon-1200.png
- cover-1080x216.png
- shot-1-landing.png, shot-2-every-employee.png, shot-3-tips-math.png, shot-4-overtime-math.png (1280×800)

## Functional video
`site/public/listing/walkthrough.mp4` (36 s, served at
https://tip-overtime-w2.vercel.app/listing/walkthrough.mp4). It walks the labelled SAMPLE café, not
a real merchant. Clover's field wants a YouTube/Vimeo link, so it needs uploading as unlisted.

## Pricing (draft — not set live)
One paid tier, **$29/month**. See README "Price".

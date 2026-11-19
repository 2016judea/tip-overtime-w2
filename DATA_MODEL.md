# Data model — the ideal version

Written 2026-11-02 from the need alone, before reading Clover's API (BUSINESS.md rule 5).
The need: for every employee of a small tipped business, the three new 2026 Form W-2
figures — Box 12 **TP** (cash tips reported to the employer), Box 12 **TT** (qualified
overtime compensation), Box 14b **TTOC** (Treasury Tipped Occupation Code) — each traceable
to the rows that produced it. The owner or their accountant files; we calculate and show.

## Entities

### Business (one per register / location)
| field | question it answers |
|---|---|
| business_id | which register is this |
| legal_name, EIN | which employer's W-2s these are (the W-2 itself prints the EIN; we only label) |
| timezone | which calendar day / workweek a timestamp falls in |
| workweek_start (weekday + hour) | where each fixed 168-hour FLSA workweek begins (FS-2026-13 Q10: fixed, recurring, no averaging) |
| tax_year | 2026 |
| state | whether a state daily-OT rule exists (only to explain why a paid OT figure is bigger than TT; never adds to TT) |

### Employee
| field | question it answers |
|---|---|
| employee_id | join key to shifts, tips, pay |
| name | whose W-2 line |
| role / job title(s) | which TTOC applies; whether they are in a tipped occupation at all |
| flsa_status (non-exempt / exempt) | does overtime count at all (exempt → TT = 0) |
| pay_type (hourly / salary) | how the regular rate is derived |
| base_hourly_rate(s), effective dates | straight-time pay per hour worked, including rate changes mid-year and per-job rates |
| cash_wage_with_tip_credit | whether a tip credit is taken (tip credit does NOT lower the FLSA regular rate: DOL FS #15) |
| ttoc_code | Box 14b |
| hire / termination date | which workweeks count |

### Shift (time punch)
| field | question it answers |
|---|---|
| shift_id, employee_id | join |
| clock_in, clock_out (instant) | hours worked, placed in a workweek |
| breaks (unpaid) | hours worked excludes bona fide meal breaks |
| job / role worked | which rate and which TTOC this time belongs to |
| declared_cash_tips | cash tips the employee reported at clock-out → TP |
| edited / audit flag | whether the punch was hand-edited |

### Payment (a sale tender)
| field | question it answers |
|---|---|
| payment_id, order_id | trace |
| employee_id (server) | whose tip |
| created_at | which period |
| tender (card / cash / other) | split charged vs cash tips |
| tip_amount | charged tips → TP |
| result / refunded / voided tip | exclude failed and refunded tips |

### Service charge (on an order)
| field | question it answers |
|---|---|
| order_id, name, amount, percentage | identify mandatory auto-gratuity / service charges — EXCLUDED from TP (they are wages, not tips) and listed separately |
| employee_id | whose order it was (for the excluded list) |

### Tip-share / pool distribution
| field | question it answers |
|---|---|
| period, giver, receiver, amount | tips moved between employees: TP is what each employee *receives* (net of what they shared out, plus what was shared in) |

### Other remuneration (off-register pay)
| field | question it answers |
|---|---|
| employee_id, workweek, kind (non-discretionary bonus, shift differential, commission), amount | raises the FLSA regular rate (DOL FS #56A) → bigger TT |
| excluded kinds (discretionary bonus, gifts, premium OT already paid) | stays out of the regular rate (29 USC 207(e)) |

### Workweek (derived, per employee)
| field | question it answers |
|---|---|
| week_start, week_end | the fixed 168-hour window |
| hours_worked | FLSA hours |
| straight_time_pay | Σ hours × rate per job + includable other remuneration |
| regular_rate | straight_time_pay ÷ hours_worked (FS #56A; tips excluded, FS #15) |
| ot_hours | max(0, hours − 40) |
| qualified_ot | ot_hours × 0.5 × regular_rate (FS-2026-13 Q16: only the FLSA half) |
| flags | anything that rested on an owner answer or a default |

### Owner answers (the things only the owner knows)
| field | question it answers |
|---|---|
| workweek_start | default Sunday 00:00 local |
| per-employee flsa_status | default non-exempt hourly |
| per-employee base rate | default: whatever the register holds; if none, asked |
| per-employee TTOC | default suggested from role name, owner confirms |
| per-employee off-register remuneration | default none, flagged |
| tip pool done outside the register | default none, flagged |
| which service charges are mandatory | default: every order-level service charge treated as mandatory (excluded) |

## Joins

Employee 1—n Shift, Employee 1—n Payment (server), Order 1—n ServiceCharge,
Employee 1—n OtherRemuneration, Shift/Remuneration → Workweek (employee, week_start),
Employee → TTOC. Output = Employee × {TP, TT, TTOC} with each figure's rows.

## Reality check against Clover (2026-11-02)

Checked field by field against Clover's v3 REST docs and against what the sandbox merchant
`4ZNNY5AK5SNT1` actually returned (`scripts/sandbox.js get …`). Permissions: Employees, Payments,
Orders and Merchant, all read-only.

| Model field | Clover | How the product handles it |
|---|---|---|
| Business name, timezone | ✅ `GET /merchants/{m}` name; `/properties` → `timezone` | read |
| legal_name, EIN | ❌ not needed for the figures | not asked (the W-2 preparer has them) |
| **workweek_start** | ❌ Clover has no payroll workweek | **asked**, default Sunday 00:00 local, shown as "to confirm" |
| state daily-OT rule | ❌ | not needed: TT is FLSA-only (FAQ Q16); only explains a bigger paid figure |
| Employee id, name | ✅ `/employees` (+ any id seen on a shift or payment, fetched one by one, so a deleted mid-year employee still gets a line) | read |
| role / job title | ⚠️ partial: system role (OWNER/ADMIN/MANAGER/EMPLOYEE), custom role names via `expand=roles`, `nickname`, `customId` | read, used only to **suggest** a TTOC |
| **flsa_status** (exempt) | ❌ | **asked**, default hourly non-exempt, flagged until confirmed |
| **pay_type, base rate(s), rate changes** | ❌ no wage field on the employee object | **asked** per employee, with dated rate changes. Until a rate is entered TT is $0 and the person is flagged. |
| **per-job rates** | ❌ shifts carry no job | not fillable: one rate per period per employee; a blended rate across jobs has to be entered as the rate, said on the page |
| **tip credit** | ❌ | **asked**, default $0; a rate under $7.25 raises a flag |
| **ttoc_code** | ❌ | **asked**: suggested from role, owner confirms up to two codes plus a "000" checkbox |
| hire / termination | ⚠️ `deletedTime` only | hours come from shifts, so not needed |
| Shift in/out | ✅ `/shifts` `inTime`/`outTime`, `overrideInTime`/`overrideOutTime` (edited punches are flagged) | read; open shifts are flagged and left out |
| unpaid breaks | ⚠️ only as separate clock-out/in pairs | read as gaps between shifts; a paid break recorded as clocked-out would be undercounted (owner's records govern) |
| declared_cash_tips | ✅ shift `cashTipsCollected` | read → TP |
| Payment tip, tender, result, refunds | ✅ `tipAmount`, `tender.labelKey`, `result`, `refunds.elements[].tipAmount` | read → TP |
| Payment server | ✅ `order.employee` (with `expand=order`), else `payment.employee` | read: the order's server gets the tip |
| Service charge | ✅ `payment.serviceCharge.amount` + name | read, **excluded from TP**, listed per row |
| **is the service charge paid to staff?** | ❌ | **asked**, default kept by the business; if paid to the server it enters their regular rate (FS #15) |
| **tip-share / pool distributions** | ❌ no tip-pool object in the REST API | **asked** as each employee's year totals shared in and shared out, flagged until answered |
| **off-register pay** (bonus, differential, commission) | ❌ | **asked** as dated amounts or date ranges, spread across workweeks by hours worked (29 CFR 778.209) |
| cash tips on a cash payment vs. clock-out declaration overlap | ❌ unknowable from rows | **asked** once per business, default "count both", shown |

**Verdict: buildable without shrinking the model.** Every field Clover can't hold goes to the owner
as a question with a visible default and a flag. Two fields are not fillable at the grain the
ideal model wants. **Per-job rates:** Clover shifts don't carry the job, so a person paid
different rates for different jobs in one week needs one blended rate. **Breaks:** only clock-out
gaps are visible. Neither changes TP, and both are named on the page. Neither is silently guessed.

Sandbox caveats, which are not product gaps: Clover's REST API won't create native card payments,
so the seeded non-cash tips sit on the sandbox's Check tender. A real card tip arrives on the same
`/payments` row with the same `tipAmount`. Refunded tips were not seeded (refunds need a card
processor); the refund path is covered by the unit tests.

---

# Data model, part 2 — the person asking (2026-11-19)

Written from the need before any code, for the re-wrap as an AI connector. The need: a worker asks
an assistant "how much of my tips and overtime can I deduct, and what goes where", and gets the
deduction with the math shown, line by line on Schedule 1-A (Form 1040), from the documents they
already hold. A bookkeeper asks "what goes in W-2 box 12 TP/TT and 14b" with payroll rows pasted in.

## Return (one per question)
| field | question it answers |
|---|---|
| tax_year | which year's rules and form lines (2025–2028 are covered by §224(h), §225(g)) |
| filing_status | cap ($12,500 vs $25,000 on overtime), phase-out start ($150,000 vs $300,000), and MFS = no deduction (§224(f), §225(e)) |
| magi | Schedule 1-A line 3: Form 1040 line 11b + excluded Puerto Rico income + Form 2555 lines 45/50 + Form 4563 line 15 |
| valid_ssn (self, spouse) | no SSN valid for employment = no deduction (§224(e), §225(d)) |

## Job (one per employer / W-2)
| field | question it answers |
|---|---|
| employer label | which row of Schedule 1-A line 4 / line 16 (the worker's own label; never stored) |
| box 12 TP | qualified tips on the W-2 (2026 Schedule 1-A line 4 col iii) |
| box 14b codes | whether the tips came in a listed occupation; "000" = some did not |
| nonqualifying part of TP | the share of TP earned in an unlisted occupation (only the worker knows) |
| Form 4137 line 1 col (c) | unreported tips; the larger of TP and this goes on line 4 col v |
| box 12 TT | qualified overtime on the W-2 (line 16 col iii) |
| pay-stub figures (before the W-2 arrives): tips to date, hours over 40 per week × regular rate, or overtime pay and its multiplier | an estimate of TP/TT, labelled as one (Notice 2025-69 methods A–D) |
| FLSA exempt | exempt = no qualified overtime, whatever was paid |
| employer is an SSTB | §224(d)(2)(B); IRS treats listed occupations as non-SSTB until SSTB final regs (Notice 2025-69, TD 10044 §1.224-1(g) reserved) |

## Self-employed tip business (one per Schedule C/E/F)
| field | question it answers |
|---|---|
| 1099 tip amount | line 6 col xii |
| net profit, other allocable deductions | the §224(c) limit: tips count only up to profit (line 6 col v) |

## Output
| field | question it answers |
|---|---|
| every Schedule 1-A line, Parts II and III | what to write where |
| tips deduction, overtime deduction | the answer |
| Form 1040 line that takes it | where the total lands |
| federal income tax saved (estimate) | what it is worth: standard deduction, ordinary brackets (Rev. Proc. 2025-32), before credits |
| flags + citations | why each number is what it is, and what is not known |

## Payroll rows (owner / bookkeeper)
One row per employee per FLSA workweek: employee label, week start date, hours worked, regular
hourly rate, tip credit, other pay in the regular rate (non-discretionary bonus, service charges
paid out), tips reported, role or TTOC. Out: TP, TT and 14b per employee, with each overtime week's
regular rate. This is the existing engine's input with the register replaced by a table.

## Reality check (2026-11-19)
Every field is printed on a document the person already holds: W-2 boxes 12 and 14b (new for
2026, General Instructions for Forms W-2 and W-3), Form 4137, 1099-NEC/MISC/K, Schedule C, Form
1040 line 11b, pay stubs. Nothing has to be fetched about the person, so nothing is stored. Two
fields only the person can fill: the nonqualifying share of TP when 14b says "000", and FLSA status
when no TT is printed. Both are asked, with the rule shown. The SSTB field is settled for now by the
transition rule. **Verdict: fillable in full. Build it.**

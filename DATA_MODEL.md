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

## Reality check against Clover

(filled in below, after reading the API)

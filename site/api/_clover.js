// Read one Clover merchant's year and map it to the engine's input shape. Read-only calls only:
// MERCHANT_R (name, timezone), EMPLOYEES_R (employees, shifts), PAYMENTS_R (tips, tenders, service
// charges), ORDERS_R (the server on the order, which can differ from whoever took the payment).
const { clover } = require("./_lib");
const { zoned } = require("./_engine");
const { suggestTtoc } = require("./_ttoc");

const DAY = 86400000;

async function pageAll(path, token, cap = 50) {
  const out = [];
  for (let offset = 0, i = 0; i < cap; i++, offset += 1000) {
    const sep = path.includes("?") ? "&" : "?";
    const j = await clover(`${path}${sep}limit=1000&offset=${offset}`, token);
    const els = j.elements || [];
    out.push(...els);
    if (els.length < 1000) break;
  }
  return out;
}

// Clover caps a time filter at 90 days per call (clover-api skill), so a year is read in 85-day windows.
function windows(from, to) {
  const w = [];
  for (let a = from; a < to; a += 85 * DAY) w.push([a, Math.min(a + 85 * DAY, to)]);
  return w;
}

async function pullYear(mid, token, year) {
  const m = await clover(`/v3/merchants/${mid}?expand=address`, token);
  let tz = m.timezone || null;
  if (!tz) { try { tz = (await clover(`/v3/merchants/${mid}/properties`, token)).timezone; } catch (_) {} }
  tz = tz || "America/Chicago";
  // From a week before Jan 1 (the first workweek can start in late December) to Jan 8 of next year.
  const from = zoned(tz, year - 1, 12, 24, 0), to = Math.min(Date.now(), zoned(tz, year + 1, 1, 8, 0));

  const employees = await pageAll(`/v3/merchants/${mid}/employees?expand=roles`, token, 5);
  const shifts = [];
  for (const [a, b] of windows(from, to)) {
    shifts.push(...await pageAll(`/v3/merchants/${mid}/shifts?filter=in_time>=${a}&filter=in_time<${b}&expand=employee`, token));
  }
  const payments = [];
  for (const [a, b] of windows(from, to)) {
    payments.push(...await pageAll(`/v3/merchants/${mid}/payments?filter=createdTime>=${a}&filter=createdTime<${b}&expand=tender,order,employee,refunds,serviceCharge`, token));
  }
  // An employee deleted mid-year still needs a W-2: fetch anyone who appears on a shift or payment
  // but is missing from the active list.
  const known = new Set(employees.map((e) => e.id));
  const seen = new Set([...shifts.map((s) => s.employee?.id), ...payments.map((p) => (p.order?.employee || p.employee)?.id)].filter(Boolean));
  for (const id of seen) if (!known.has(id)) {
    try { employees.push({ ...(await clover(`/v3/merchants/${mid}/employees/${id}?expand=roles`, token)), _formerFromRows: true }); }
    catch (_) { employees.push({ id, name: `Employee ${id}`, _formerFromRows: true }); }
  }
  return { merchant: { id: mid, name: m.name, tz }, employees, shifts, payments, pulledAt: Date.now(), window: [from, to] };
}

function tenderKind(t) {
  const k = `${t?.labelKey || ""} ${t?.label || ""}`.toLowerCase();
  if (/cash/.test(k)) return "cash";
  if (/credit|debit|card|gift/.test(k)) return "card";
  return "other";
}

function toEngineInput(raw, year) {
  const employees = raw.employees
    .filter((e) => !/^OWNER$/.test(e.role || "") || raw.shifts.some((s) => s.employee?.id === e.id))
    .map((e) => {
      const roleNames = (e.roles?.elements || []).map((r) => r.name).filter(Boolean);
      const role = roleNames.join(", ") || e.role || "";
      return { id: e.id, name: e.name || e.nickname || e.id, role, systemRole: e.role || "",
        former: !!(e.deletedTime || e._formerFromRows), suggestedTtoc: suggestTtoc(`${role} ${e.nickname || ""} ${e.customId || ""}`) };
    });
  const shifts = raw.shifts.map((s) => ({
    id: s.id, employeeId: s.employee?.id,
    in: s.overrideInTime || s.inTime, out: s.overrideOutTime || s.outTime || null,
    edited: !!(s.overrideInTime || s.overrideOutTime),
    declaredCashTips: s.cashTipsCollected || 0,
  }));
  const payments = raw.payments.map((p) => {
    const server = p.order?.employee?.id || p.employee?.id;
    const refundedTip = (p.refunds?.elements || p.refunds || []).reduce((a, r) => a + (r.tipAmount || 0), 0);
    const sc = p.serviceCharge?.amount ?? p.serviceChargeAmount ?? 0;
    return {
      id: p.id, orderId: p.order?.id, employeeId: server, rangBy: p.employee?.id,
      createdTime: p.createdTime, tender: tenderKind(p.tender), tenderLabel: p.tender?.label || "",
      tipCents: p.tipAmount || 0, refundedTipCents: refundedTip,
      serviceChargeCents: sc, serviceChargeName: p.serviceCharge?.name || "",
      result: p.result || "SUCCESS",
    };
  });
  return { business: { name: raw.merchant.name, tz: raw.merchant.tz, year }, employees, shifts, payments, source: "clover" };
}

module.exports = { pullYear, toEngineInput, tenderKind };

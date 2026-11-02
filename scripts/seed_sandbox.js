// Seeds the SANDBOX test merchant with a register that exercises every rule: two >40 h workweeks,
// a shift across the Saturday→Sunday boundary, card tips, a cash tip on a cash payment, cash tips
// declared at clock-out, a service charge, a payment taken by someone other than the order's server,
// and a refunded tip is NOT seeded (Clover sandbox refunds need a card processor). Synthetic people.
// Run via: node scripts/sandbox.js seed   (needs the app's sandbox install to hold WRITE permissions)
const { api, MID } = require("./sandbox");
const { zoned } = require("../site/api/_engine");

const TZ = "America/Los_Angeles";
const H = 3600000;
// Clover's REST API refuses native card payments ("use an external tender type"), and creating or
// enabling a tender needs MERCHANT_W, so the sandbox's non-cash tips ride the enabled Check tender.
// A real card tip arrives on the same /payments row with the same tipAmount field.
const CASH = "DYASSQJVWQ20Y", CARD = "8DW8Y06A6WXG2";

module.exports = async function seed(token) {
  const m = (p, method, body) => api(token, `/v3/merchants/${MID}${p}`, method, body);
  const people = [
    { name: "Rosa Diaz (sandbox)", customId: "Server", nickname: "Rosa" },
    { name: "Marcus Lee (sandbox)", customId: "Bartender", nickname: "Marcus" },
    { name: "Jo Kim (sandbox)", customId: "Line cook", nickname: "Jo" },
  ];
  const existing = (await m("/employees?limit=200")).elements || [];
  const ids = {};
  for (const p of people) {
    const found = existing.find((e) => e.name === p.name);
    ids[p.nickname] = found ? found.id : (await m("/employees", "POST", { ...p, role: "EMPLOYEE" })).id;
  }
  console.log("employees", ids);

  const shift = async (who, y, mo, d, h, len, cashTips = 0) => {
    const inTime = zoned(TZ, y, mo, d, h);
    const s = await m(`/employees/${ids[who]}/shifts`, "POST", { employee: { id: ids[who] }, inTime, outTime: inTime + len * H, cashTipsCollected: cashTips });
    return s.id;
  };
  // Workweek Sun Oct 4 – Sat Oct 10 2026 and Sun Oct 11 – Sat Oct 17.
  if (!process.env.SKIP_SHIFTS) {
  for (const d of [5, 6, 7, 8, 9]) await shift("Rosa", 2026, 10, d, 10, 9, 1500);   // 45 h
  for (const d of [12, 13, 14, 15]) await shift("Rosa", 2026, 10, d, 10, 8, 1200);  // 32 h
  for (const d of [4, 5, 6, 7, 8, 9]) await shift("Jo", 2026, 10, d, 7, 9);         // 54 h
  for (const d of [12, 13, 14, 15, 16]) await shift("Jo", 2026, 10, d, 7, 8);       // 40 h
  for (const d of [6, 7, 8]) await shift("Marcus", 2026, 10, d, 16, 10, 2500);      // 30 h ...
  await shift("Marcus", 2026, 10, 10, 18, 10, 3000);                                 // Sat 18:00 → Sun 04:00: 6 h + 4 h
  for (const d of [11, 12, 13, 14]) await shift("Marcus", 2026, 10, d, 16, 10, 2000); // ... 4 h + 40 h = 44 h week 2
  }
  console.log("shifts done");

  const sale = async (server, takenBy, amount, tip, tender, sc) => {
    const o = await m("/orders", "POST", { employee: { id: ids[server] }, total: amount + (sc || 0), state: "open", title: "seed" });
    const body = { amount: amount + (sc || 0), tipAmount: tip, tender: { id: tender }, employee: { id: ids[takenBy] }, result: "SUCCESS" };
    if (sc) body.serviceCharge = { id: "KXTK1P95P9CVT", name: "Service Charge", amount: sc };
    const p = await m(`/orders/${o.id}/payments`, "POST", body);
    return { order: o.id, payment: p.id };
  };
  const made = [];
  made.push(await sale("Rosa", "Rosa", 4200, 800, CARD));
  made.push(await sale("Rosa", "Rosa", 6100, 1200, CARD));
  made.push(await sale("Rosa", "Rosa", 2300, 300, CASH));
  made.push(await sale("Rosa", "Marcus", 5000, 1000, CARD)); // order is Rosa's, payment taken by Marcus
  made.push(await sale("Rosa", "Rosa", 20000, 0, CARD, 3600)); // party with an 18% service charge, no tip
  made.push(await sale("Marcus", "Marcus", 3800, 700, CARD));
  made.push(await sale("Marcus", "Marcus", 2600, 500, CARD));
  console.log("sales", made);
};

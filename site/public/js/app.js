// The report page. Same renderer for the SAMPLE café on the landing page and a real merchant's report.
// The numbers come from W2Engine (site/api/_engine.js, copied here at deploy) running in the browser on the
// register rows; this file only draws them and collects the owner's answers.
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const usd = (c) => (c < 0 ? "−" : "") + "$" + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rate = (c) => "$" + (c / 100).toFixed(4).replace(/0{1,2}$/, "");
  const dollarsToCents = (v) => { const n = parseFloat(String(v).replace(/[$,\s]/g, "")); return isFinite(n) ? Math.round(n * 100) : 0; };
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const shortWeek = (l) => { const m = /(\d{4})-(\d\d)-(\d\d) → (\d{4})-(\d\d)-(\d\d)/.exec(l); if (!m) return l;
    const a = `${MON[+m[2] - 1]} ${+m[3]}`, b = m[5] === m[2] ? `${+m[6]}` : `${MON[+m[5] - 1]} ${+m[6]}`;
    return `${a}–${b}${m[4] !== m[1] ? `, ${m[4]}` : ""}`; };
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  let S = null; // { mode, input, answers, root, open:Set }

  function mount(root, mode, input, answers) {
    S = { mode, input, answers: answers || {}, root, open: new Set(), showAll: new Set() };
    S.answers.employees = S.answers.employees || {};
    // Seed each employee's suggested occupation code so the default is visible, never silent.
    for (const e of input.employees) {
      const a = (S.answers.employees[e.id] = S.answers.employees[e.id] || {});
      if (!a.ttoc && e.suggestedTtoc) a.ttoc = [e.suggestedTtoc];
      if (e.suggestedTtoc) a.ttocSuggested = e.suggestedTtoc;
    }
    root.addEventListener("change", onChange);
    root.addEventListener("click", onClick);
    draw();
  }

  let saveTimer = null;
  function changed() {
    draw();
    if (S.mode !== "live") return;
    clearTimeout(saveTimer);
    const st = $("#save-state"); if (st) st.textContent = "Saving…";
    saveTimer = setTimeout(async () => {
      const r = await fetch("/api/answers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(S.answers) });
      const st2 = $("#save-state"); if (st2) st2.textContent = r.ok ? "Answers saved" : "Could not save — try again";
    }, 600);
  }

  function emp(id) { return (S.answers.employees[id] = S.answers.employees[id] || {}); }

  function onChange(ev) {
    const t = ev.target, k = t.dataset.k; if (!k) return;
    const id = t.dataset.emp, a = id ? emp(id) : S.answers;
    const v = t.type === "checkbox" ? t.checked : t.value;
    switch (k) {
      case "workweekDay": S.answers.workweekStart = { weekday: +v, hour: (S.answers.workweekStart || {}).hour || 0 }; break;
      case "workweekHour": S.answers.workweekStart = { weekday: (S.answers.workweekStart || {}).weekday || 0, hour: +v }; break;
      case "serviceChargesTo": S.answers.serviceChargesTo = v; break;
      case "cashDecl": S.answers.cashPaymentTipsInDeclarations = v === "yes"; break;
      case "status": a.status = v; a.statusConfirmed = true; break;
      case "statusConfirmed": a.statusConfirmed = v; break;
      case "rateFrom": case "rateCents": {
        if (!a.rates || !a.rates.length) a.rates = [{ from: `${S.input.business.year}-01-01`, cents: 0 }];
        const i = +t.dataset.i; if (k === "rateFrom") a.rates[i].from = v; else a.rates[i].cents = dollarsToCents(v); break; }
      case "tipCredit": a.tipCreditCents = dollarsToCents(v); break;
      case "salary": a.weeklySalaryCents = dollarsToCents(v); break;
      case "salaryHours": a.salaryHours = +v || 40; break;
      case "ttoc0": case "ttoc1": { const c = a.ttoc ? [...a.ttoc] : []; c[k === "ttoc0" ? 0 : 1] = v; a.ttoc = c.filter(Boolean); a.ttocConfirmed = true; break; }
      case "ttocConfirmed": a.ttocConfirmed = v; break;
      case "nonq": a.nonqualifyingTips = v; break;
      case "shareIn": a.tipShareInCents = dollarsToCents(v); break;
      case "shareOut": a.tipShareOutCents = dollarsToCents(v); break;
      case "opFrom": case "opTo": case "opCents": case "opNote": {
        const o = a.otherPay[+t.dataset.i];
        if (k === "opFrom") o.from = v; if (k === "opTo") o.to = v; if (k === "opCents") o.cents = dollarsToCents(v); if (k === "opNote") o.note = v; break; }
      default: return;
    }
    changed();
  }

  function onClick(ev) {
    const b = ev.target.closest("[data-act]"); if (!b) return;
    const id = b.dataset.emp, act = b.dataset.act;
    if (act === "toggle") { S.open.has(id) ? S.open.delete(id) : S.open.add(id); draw(); return; }
    if (act === "allweeks") { S.showAll.has(id) ? S.showAll.delete(id) : S.showAll.add(id); draw(); return; }
    if (act === "addRate") { const a = emp(id); a.rates = a.rates || []; a.rates.push({ from: `${S.input.business.year}-07-01`, cents: (a.rates.at(-1) || {}).cents || 0 }); changed(); return; }
    if (act === "delRate") { emp(id).rates.splice(+b.dataset.i, 1); changed(); return; }
    if (act === "addOther") { const a = emp(id); a.otherPay = a.otherPay || []; a.otherPay.push({ from: `${S.input.business.year}-01-01`, to: `${S.input.business.year}-01-31`, cents: 0, note: "" }); changed(); return; }
    if (act === "noOther") { emp(id).otherPay = []; changed(); return; }
    if (act === "delOther") { emp(id).otherPay.splice(+b.dataset.i, 1); changed(); return; }
    if (act === "noShare") { const a = emp(id); a.tipShareInCents = a.tipShareInCents || 0; a.tipShareOutCents = a.tipShareOutCents || 0; changed(); return; }
    if (act === "csv") { csv(); return; }
  }

  function draw() {
    const r = W2Engine.report(S.input, S.answers);
    S.last = r;
    const ww = S.answers.workweekStart || { weekday: 0, hour: 0 };
    const un = r.assumptions.filter((a) => !a.answered).length;
    S.root.innerHTML = `
      <section class="totals">
        <div><b>${r.totals.employees}</b><span>employees</span></div>
        <div><b>${usd(r.totals.TP)}</b><span>tips (TP)</span></div>
        <div><b>${usd(r.totals.TT)}</b><span>qualified OT (TT)</span></div>
        <div class="${r.totals.flagged ? "warn" : "ok"}"><b>${r.totals.flagged}</b><span>need an answer</span></div>
      </section>
      <section class="card qs">
        <h3>About the business ${un ? `<em class="chip warn">${un} to confirm</em>` : `<em class="chip ok">confirmed</em>`}</h3>
        <label>Your workweek starts
          <span class="row"><select data-k="workweekDay">${DAYS.map((d, i) => `<option value="${i}" ${i === ww.weekday ? "selected" : ""}>${d}</option>`).join("")}</select>
          <select data-k="workweekHour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === ww.hour ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("")}</select></span>
          <small>Overtime is counted per fixed 7-day workweek, never averaged. Use the one your payroll uses.</small></label>
        <label>Service charges (auto-gratuity) go to
          <select data-k="serviceChargesTo"><option value="house" ${S.answers.serviceChargesTo !== "server" ? "selected" : ""}>the business</option><option value="server" ${S.answers.serviceChargesTo === "server" ? "selected" : ""}>the employee who rang the order</option></select>
          <small>Either way they are not tips. If staff get them, they raise that person's overtime rate.</small></label>
        <label>Do clock-out cash tip declarations already include tips rung on cash payments?
          <select data-k="cashDecl"><option value="no" ${!S.answers.cashPaymentTipsInDeclarations ? "selected" : ""}>No, count both</option><option value="yes" ${S.answers.cashPaymentTipsInDeclarations ? "selected" : ""}>Yes, count once</option></select></label>
      </section>
      <div class="listhead"><h2>Each employee</h2>${S.mode === "live" ? `<span id="save-state" class="muted"></span>` : ""}<button class="btn ghost" data-act="csv">Download CSV</button></div>
      ${r.employees.map(card).join("")}
      <p class="fine">${esc(r.disclaimer)}</p>`;
  }

  function card(e) {
    const open = S.open.has(e.id);
    const a = emp(e.id);
    const meta = S.input.employees.find((x) => x.id === e.id) || {};
    return `<article class="emp ${e.ready ? "" : "needs"}">
      <button class="emphead" data-act="toggle" data-emp="${e.id}" aria-expanded="${open}">
        <span class="who"><b>${esc(e.name)}</b><small>${esc(e.role || meta.systemRole || "")}${meta.former ? " · former employee" : ""}</small></span>
        <span class="chip ${e.ready ? "ok" : "warn"}">${e.ready ? "Ready" : `${e.flags.length} to answer`}</span>
      </button>
      <div class="boxes">
        <div><small>Box 12 · TP</small><b>${usd(e.boxes.TP)}</b></div>
        <div><small>Box 12 · TT</small><b>${usd(e.boxes.TT)}</b></div>
        <div><small>Box 14b</small><b>${e.boxes["14b"].length ? e.boxes["14b"].join(", ") : "—"}</b></div>
      </div>
      ${open ? detail(e, a) : `<button class="more" data-act="toggle" data-emp="${e.id}">Show the math${e.ready ? "" : " and answer"} ›</button>`}
    </article>`;
  }

  function detail(e, a) {
    const yr = S.input.business.year;
    const flags = e.flags.length ? `<ul class="flags">${e.flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : "";
    const st = a.status || "hourly";
    const rates = (a.rates && a.rates.length ? a.rates : [{ from: `${yr}-01-01`, cents: 0 }]);
    const ttocOpts = (sel) => `<option value="">—</option>` + Object.entries(W2Ttoc.TTOC).map(([c, t]) => `<option value="${c}" ${c === sel ? "selected" : ""}>${c} ${esc(t)}${c === a.ttocSuggested ? " (suggested)" : ""}</option>`).join("");
    const t = e.tips, o = e.overtime;
    const otWeeks = o.weeks.filter((w) => S.showAll.has(e.id) || w.otHours > 0);
    return `<div class="detail">
      ${flags}
      <h4>Pay</h4>
      <label>Pay type <span class="row"><select data-k="status" data-emp="${e.id}">
        <option value="hourly" ${st === "hourly" ? "selected" : ""}>Hourly</option>
        <option value="salaried" ${st === "salaried" ? "selected" : ""}>Salaried, gets overtime</option>
        <option value="exempt" ${st === "exempt" ? "selected" : ""}>Exempt (no overtime)</option></select>
        <span class="check"><input type="checkbox" data-k="statusConfirmed" data-emp="${e.id}" ${a.statusConfirmed ? "checked" : ""}> confirmed</span></span></label>
      ${st === "hourly" ? `
        <div class="sub">Hourly rate${rates.length > 1 ? "s" : ""} <small>Clover does not store wages. Enter what you pay.</small></div>
        ${rates.map((r, i) => `<div class="row"><input type="date" data-k="rateFrom" data-emp="${e.id}" data-i="${i}" value="${r.from}" aria-label="from"><input inputmode="decimal" data-k="rateCents" data-emp="${e.id}" data-i="${i}" value="${r.cents ? (r.cents / 100).toFixed(2) : ""}" placeholder="$/hour">${i ? `<button class="x" data-act="delRate" data-emp="${e.id}" data-i="${i}" aria-label="remove">×</button>` : ""}</div>`).join("")}
        <button class="link" data-act="addRate" data-emp="${e.id}">+ rate changed during the year</button>
        <label>Tip credit taken, per hour <input inputmode="decimal" data-k="tipCredit" data-emp="${e.id}" value="${a.tipCreditCents ? (a.tipCreditCents / 100).toFixed(2) : ""}" placeholder="$0.00">
          <small>Only if you pay under minimum wage and count tips toward it. Overtime is then figured on the full minimum wage (DOL Fact Sheet #15).</small></label>` : ""}
      ${st === "salaried" ? `
        <label>Weekly salary <input inputmode="decimal" data-k="salary" data-emp="${e.id}" value="${a.weeklySalaryCents ? (a.weeklySalaryCents / 100).toFixed(2) : ""}" placeholder="$"></label>
        <label>Hours the salary is meant to cover <input inputmode="numeric" data-k="salaryHours" data-emp="${e.id}" value="${a.salaryHours || 40}"></label>` : ""}
      ${st !== "exempt" ? `
        <div class="sub">Other pay outside Clover <small>Non-discretionary bonuses, shift differentials, commissions. They raise the overtime rate.</small></div>
        ${(a.otherPay || []).map((p, i) => `<div class="row wrap"><input type="date" data-k="opFrom" data-emp="${e.id}" data-i="${i}" value="${p.from || p.date || ""}" aria-label="from"><input type="date" data-k="opTo" data-emp="${e.id}" data-i="${i}" value="${p.to || p.date || ""}" aria-label="to"><input inputmode="decimal" data-k="opCents" data-emp="${e.id}" data-i="${i}" value="${p.cents ? (p.cents / 100).toFixed(2) : ""}" placeholder="$"><input data-k="opNote" data-emp="${e.id}" data-i="${i}" value="${esc(p.note || "")}" placeholder="what for"><button class="x" data-act="delOther" data-emp="${e.id}" data-i="${i}" aria-label="remove">×</button></div>`).join("")}
        <span class="row"><button class="link" data-act="addOther" data-emp="${e.id}">+ add other pay</button>${a.otherPay === undefined ? `<button class="link" data-act="noOther" data-emp="${e.id}">None</button>` : ""}</span>` : ""}

      <h4>Tips → Box 12 code TP: ${usd(t.totalCents)}</h4>
      <table class="math"><tbody>
        <tr><td>Charged tips (card)</td><td>${usd(t.cardCents)}</td></tr>
        <tr><td>Tips rung on cash payments</td><td>${usd(t.cashTenderCents)}</td></tr>
        <tr><td>Cash tips declared at clock-out</td><td>${usd(t.declaredCents)}</td></tr>
        <tr><td>Tips shared in (outside Clover)</td><td>${usd(t.shareInCents)}</td></tr>
        <tr><td>Tips shared out (outside Clover)</td><td>${usd(-t.shareOutCents)}</td></tr>
        <tr class="sum"><td>Box 12 TP</td><td>${usd(t.totalCents)}</td></tr>
      </tbody></table>
      ${t.refundedCents ? `<p class="muted">${usd(t.refundedCents)} of tips were refunded and are taken back out.</p>` : ""}
      <div class="row wrap"><label class="half">Shared in, year total <input inputmode="decimal" data-k="shareIn" data-emp="${e.id}" value="${a.tipShareInCents ? (a.tipShareInCents / 100).toFixed(2) : ""}" placeholder="$0.00"></label>
      <label class="half">Shared out, year total <input inputmode="decimal" data-k="shareOut" data-emp="${e.id}" value="${a.tipShareOutCents ? (a.tipShareOutCents / 100).toFixed(2) : ""}" placeholder="$0.00"></label></div>
      ${a.tipShareInCents === undefined && a.tipShareOutCents === undefined && t.totalCents ? `<button class="link" data-act="noShare" data-emp="${e.id}">No tips shared outside Clover</button>` : ""}
      ${rowsTable(t.rows, ["when", "kind", "countedCents"], ["When", "Row", "Counted"])}
      ${t.serviceChargesExcluded.totalCents ? `<div class="excl"><b>Service charges left out of tips: ${usd(t.serviceChargesExcluded.totalCents)}</b>
        <small>A mandatory charge on the bill is not a tip (IRS W-2 instructions; DOL Fact Sheet #15).</small>
        ${rowsTable(t.serviceChargesExcluded.rows, ["when", "name", "cents"], ["When", "Charge", "Amount"])}</div>` : ""}

      <h4>Box 14b occupation code</h4>
      <div class="row wrap"><select data-k="ttoc0" data-emp="${e.id}" aria-label="first code">${ttocOpts((a.ttoc || [])[0])}</select>
      <select data-k="ttoc1" data-emp="${e.id}" aria-label="second code">${ttocOpts((a.ttoc || [])[1])}</select></div>
      <span class="check"><input type="checkbox" data-k="ttocConfirmed" data-emp="${e.id}" ${a.ttocConfirmed ? "checked" : ""}> confirmed</span>
      <span class="check"><input type="checkbox" data-k="nonq" data-emp="${e.id}" ${a.nonqualifyingTips ? "checked" : ""}> some tips came from work not on the IRS list (adds 000)</span>

      <h4>Overtime → Box 12 code TT: ${usd(o.totalCents)}</h4>
      ${st === "exempt" ? `<p class="muted">Exempt: no overtime is required, so nothing qualifies.</p>` : `
      <p class="muted">Each workweek: hours over 40 × ½ × regular rate. Regular rate = pay for the week ÷ hours worked. Only the FLSA's required "half" counts, even if you pay double time (IRS FS-2026-13, Q12 and Q16).</p>
      <div class="scroll"><table class="weeks"><thead><tr><th>Workweek</th><th>Qualified OT</th><th>OT hours</th><th>Regular rate</th><th>Hours</th><th>Pay that sets the rate</th></tr></thead><tbody>
      ${otWeeks.map((w) => `<tr class="${w.inYear ? "" : "out"}"><td class="wk">${esc(shortWeek(w.label))}${w.flags.length ? `<div class="wflag">${w.flags.map(esc).join("<br>")}</div>` : ""}</td><td><b>${usd(w.qualifiedOtCents)}</b></td><td>${w.otHours.toFixed(2)}</td><td>${rate(w.regularRateCents)}/h</td><td>${w.hours.toFixed(2)}</td>
        <td>${w.parts.map((p) => `${esc(p.what)} = ${usd(Math.round(p.cents))}`).join("<br>")}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">No workweek over 40 hours.</td></tr>`}
      </tbody></table></div>
      <button class="link" data-act="allweeks" data-emp="${e.id}">${S.showAll.has(e.id) ? "Show only overtime weeks" : `Show all ${o.weeks.length} workweeks and their shifts`}</button>
      ${S.showAll.has(e.id) ? `<details><summary>Every clock-in and clock-out</summary>${rowsTable(o.weeks.flatMap((w) => w.shifts), ["from", "to", "hours"], ["In", "Out", "Hours"], 2000)}</details>` : ""}`}
      <button class="more" data-act="toggle" data-emp="${e.id}">Close ‹</button>
    </div>`;
  }

  function rowsTable(rows, keys, heads, max = 0) {
    if (!rows.length) return "";
    const lim = max || 400;
    return `<details><summary>${rows.length} register row${rows.length === 1 ? "" : "s"}</summary><div class="scroll"><table class="rows"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>
      ${rows.slice(0, lim).map((r) => `<tr>${keys.map((k) => `<td>${/Cents$|^cents$/.test(k) ? usd(r[k]) : esc(r[k] ?? "")}${k === "kind" && r.note ? ` <small>(${esc(r.note)})</small>` : ""}</td>`).join("")}</tr>`).join("")}
      </tbody></table>${rows.length > lim ? `<p class="muted">First ${lim} shown; the CSV has every row.</p>` : ""}</div></details>`;
  }

  function csv() {
    const r = S.last, q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["employee", "role", "box12_TP", "box12_TT", "box14b", "ready", "open_questions"].join(",")];
    for (const e of r.employees) lines.push([q(e.name), q(e.role), (e.boxes.TP / 100).toFixed(2), (e.boxes.TT / 100).toFixed(2), q(e.boxes["14b"].join(" ")), e.ready, q(e.flags.join("; "))].join(","));
    lines.push("", ["employee", "workweek", "counted_in_year", "hours", "pay_setting_rate", "regular_rate", "ot_hours", "qualified_ot", "flags"].join(","));
    for (const e of r.employees) for (const w of e.overtime.weeks) lines.push([q(e.name), q(w.label), w.inYear, w.hours.toFixed(4), (w.straightCents / 100).toFixed(4), (w.regularRateCents / 100).toFixed(4), w.otHours.toFixed(4), (w.qualifiedOtCents / 100).toFixed(2), q(w.flags.join("; "))].join(","));
    lines.push("", ["employee", "when", "tip_row", "counted"].join(","));
    for (const e of r.employees) for (const t of e.tips.rows) lines.push([q(e.name), q(t.when), q(t.kind), ((t.countedCents || 0) / 100).toFixed(2)].join(","));
    lines.push("", q(r.disclaimer));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const aEl = document.createElement("a");
    aEl.href = URL.createObjectURL(blob);
    aEl.download = `w2-tips-overtime-${r.year}${S.mode === "sample" ? "-SAMPLE" : ""}.csv`;
    document.body.appendChild(aEl); aEl.click(); aEl.remove();
    if (window.va) window.va("event", { name: "csv_download", mode: S.mode });
  }

  window.W2App = { mount };
})();

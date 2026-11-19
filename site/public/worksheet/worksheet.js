// The worksheet: same calculator as the MCP tool (/js/deduction.js is site/api/_deduction.js).
// Prefilled from window.__TOW_FRAG (set and wiped from the URL in <head>, before analytics loads).
(function () {
  var D = window.W2Deduction, TT = (window.W2Ttoc || {}).TTOC || {};
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var src = "direct"; try { src = new URLSearchParams(location.search).get("src") || "direct"; } catch (e) {}
  var ph = function (ev, props) { try { window.posthog && posthog.capture(ev, Object.assign({ src: src }, props || {})); } catch (e) {} };
  var form = $("#f"), jobsEl = $("#jobs");
  var JOB_FIELDS = ["box12_tp", "box14b", "box12_tt", "tips_paystub", "ot_hours_over_40", "regular_rate", "ot_pay_total", "ot_multiplier", "nonqualified_tips", "form4137_tips", "flsa_exempt"];

  function decode(fr) {
    var b = fr.slice(3).replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    var bin = atob(b), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function jobCard(j, i) {
    var stub = j.tips_paystub || j.ot_hours_over_40 || j.ot_pay_total || j.ot_premium_paid;
    var d = document.createElement("div");
    d.className = "card job"; d.dataset.i = i;
    d.innerHTML = '<h3>Job ' + (i + 1) + ' <span class="muted">(one W-2)</span>' + (i ? '<button type="button" class="x rm" aria-label="Remove job">×</button>' : "") + '</h3>' +
      '<div class="pair"><label>Tips: W-2 box 12, code TP<input data-k="box12_tp" inputmode="decimal" placeholder="0"></label>' +
      '<label>Overtime: W-2 box 12, code TT<input data-k="box12_tt" inputmode="decimal" placeholder="0"></label></div>' +
      '<label>Box 14b occupation code(s)<small>e.g. 102 for wait staff. 000 means some tips came in a job not on the IRS list.</small><input data-k="box14b" placeholder="102"></label>' +
      '<p class="muted code-name"></p>' +
      '<label class="nq" hidden>How much of TP came from the job that is not on the list?<input data-k="nonqualified_tips" inputmode="decimal"></label>' +
      '<details' + (stub ? " open" : "") + '><summary>No W-2 yet? Use your pay stubs</summary>' +
      '<label>Tips so far this year<input data-k="tips_paystub" inputmode="decimal"></label>' +
      '<div class="pair"><label>Hours over 40 in a week, added up<input data-k="ot_hours_over_40" inputmode="decimal"></label>' +
      '<label>Your regular hourly rate<input data-k="regular_rate" inputmode="decimal"></label></div>' +
      '<p class="muted">Or, if you only know the overtime pay:</p>' +
      '<div class="pair"><label>Overtime pay so far (the whole amount)<input data-k="ot_pay_total" inputmode="decimal"></label>' +
      '<label>Paid at<select data-k="ot_multiplier"><option value="1.5">time and a half</option><option value="2">double time</option></select></label></div>' +
      '<label class="check"><input type="checkbox" data-k="flsa_exempt"> I\'m exempt from overtime (e.g. salaried manager)</label>' +
      '<label>Form 4137 line 1, column (c), if you filed one for unreported tips<input data-k="form4137_tips" inputmode="decimal"></label></details>';
    JOB_FIELDS.forEach(function (k) {
      var el = d.querySelector('[data-k="' + k + '"]'); if (!el || j[k] === undefined || j[k] === null) return;
      if (el.type === "checkbox") el.checked = !!j[k]; else el.value = j[k];
    });
    return d;
  }

  function readForm() {
    var fd = new FormData(form);
    var jobs = Array.prototype.map.call(jobsEl.querySelectorAll(".job"), function (d) {
      var j = {};
      d.querySelectorAll("[data-k]").forEach(function (el) {
        var k = el.dataset.k;
        if (el.type === "checkbox") { if (el.checked) j[k] = true; }
        else if (k === "ot_multiplier") { if (el.value !== "1.5") j[k] = Number(el.value); }
        else if (el.value.trim() !== "") j[k] = el.value.trim();
      });
      var codes = String(j.box14b || "").split(/[\s,;]+/).filter(Boolean);
      d.querySelector(".nq").hidden = codes.indexOf("000") < 0;
      d.querySelector(".code-name").textContent = codes.map(function (c) { return TT[c] ? c + ": " + TT[c] : c ? c + ": not a Treasury Tipped Occupation Code" : ""; }).join(" · ");
      return j;
    });
    var x = { tax_year: Number(fd.get("tax_year")), filing_status: fd.get("filing_status"), agi: fd.get("agi") || undefined, jobs: jobs };
    if (fd.get("se_tips")) x.self_employed = [{ tips_1099: fd.get("se_tips"), net_profit: fd.get("se_profit") || undefined }];
    if (fd.get("ot_1099")) x.ot_1099 = fd.get("ot_1099");
    if (fd.get("no_ssn")) x.valid_ssn = false;
    return x;
  }

  var computedOnce = false;
  function render() {
    var x = readForm();
    var r = D.compute(Object.assign({ _ttoc: TT }, x));
    $("#yr").textContent = r.tax_year;
    var anything = r.tips.qualified_cents > 0 || r.overtime.qualified_cents > 0;
    var stop = r.flags.filter(function (f) { return f.level === "stop"; })[0];
    $("#headline").textContent = anything ? (r.total_cents > 0 ? "You can deduct " + D.usd(r.total_cents) + "." : "No deduction.") : "How much of your tips and overtime you can deduct.";
    $("#sub").textContent = !anything ? "Fill in what's on your W-2 (or pay stubs). The answer updates as you type."
      : stop ? stop.text
      : D.usd(r.tips.deduction_cents) + " of tips and " + D.usd(r.overtime.deduction_cents) + " of overtime. Both go on Schedule 1-A, then Form 1040 line " + (r.tax_year === 2025 ? "13b" : "13a") + ".";
    var tot = $("#tot");
    tot.hidden = !anything;
    tot.innerHTML = '<div class="ok"><b>' + D.usd(r.tips.deduction_cents) + '</b><span>Tips deduction</span></div><div class="ok"><b>' + D.usd(r.overtime.deduction_cents) + '</b><span>Overtime deduction</span></div>' +
      '<div><b>' + (r.saved ? D.usd(r.saved.cents) : "–") + '</b><span>' + (r.saved ? "Federal tax saved (est.)" : "Tax saved: add income") + '</span></div>' +
      '<div><b>' + D.usd(r.total_cents) + '</b><span>Total, Form 1040 line ' + (r.tax_year === 2025 ? "13b" : "13a") + '</span></div>';
    var rows = r.lines.map(function (l) {
      return '<tr' + (l.total ? ' class="sum"' : "") + '><td>' + esc(l.line) + '</td><td>' + esc(l.text) + '</td><td>' + (l.cents !== undefined ? D.usd(l.cents) : esc(l.value)) + '</td></tr>';
    }).join("");
    $("#lines").innerHTML = '<h3>Schedule 1-A (Form 1040) ' + r.tax_year + (r.tax_year === 2025 ? "" : ", lines as numbered on the 2026 draft") + ', ' + esc(r.filing_status_label) + '</h3><div class="scroll"><table class="math lines">' + rows + '</table></div>' +
      (r.saved ? '<p class="muted">Tax saved: taxable income ' + D.usd(Math.round(r.saved.taxableBefore * 100)) + ' falls to ' + D.usd(Math.round(r.saved.taxableAfter * 100)) + ' after the $' + r.saved.standardDeduction.toLocaleString() + ' standard deduction and these deductions. ' + esc(r.saved.note) + '</p>' : "");
    $("#flags").innerHTML = r.flags.length ? '<ul class="flags">' + r.flags.map(function (f) { return "<li>" + esc(f.text) + (D.SOURCES[f.src] ? ' <a href="' + D.SOURCES[f.src].url + '">[' + esc(D.SOURCES[f.src].title) + "]</a>" : "") + "</li>"; }).join("") + "</ul>" : "";
    $("#rules").innerHTML = "<h2>The rules this used</h2><ul>" + r.sources.map(function (s) { return '<li><a href="' + s.url + '">' + esc(s.title) + "</a></li>"; }).join("") +
      "<li>Tips count only from a job on the <a href=\"https://www.irs.gov/tippedoccupations\">IRS list</a>; service charges and automatic gratuities are never tips. Only the FLSA half of time and a half counts as overtime. Social Security, Medicare and state tax still apply.</li></ul>";
    if (anything && !computedOnce) { computedOnce = true; ph("worksheet_computed", { has_tips: r.tips.qualified_cents > 0, has_ot: r.overtime.qualified_cents > 0, year: r.tax_year, estimate: r.jobs.some(function (j) { return j.tips.source === "estimate" || j.overtime.source === "estimate"; }) }); }
  }

  function setJobs(list) {
    jobsEl.innerHTML = "";
    (list && list.length ? list : [{}]).forEach(function (j, i) { jobsEl.appendChild(jobCard(j, i)); });
  }

  function owner(o) {
    form.hidden = true; $("#lines").hidden = true; $("#addjob").hidden = true;
    $("#headline").textContent = "W-2 box 12 TP, TT and box 14b for " + o.e.length + " employee" + (o.e.length === 1 ? "" : "s") + ".";
    $("#sub").textContent = "Tax year " + o.y + ", workweek starting " + o.w + ". Worked out from the payroll rows in your chat; the overtime math for each week is there too.";
    $("#yr").textContent = o.y;
    var tp = 0, tt = 0;
    var rows = o.e.map(function (e) { tp += e[1]; tt += e[2]; return "<tr><td>" + esc(e[0]) + (e[5] ? '<br><span class="chip warn">' + e[5] + " to check</span>" : '<br><span class="chip ok">ready</span>') + "</td><td>" + D.usd(Math.round(e[1] * 100)) + "</td><td>" + D.usd(Math.round(e[2] * 100)) + "</td><td>" + esc(e[3] || "–") + (e[3] ? '<small class="muted"> ' + esc(e[3].split(" ").map(function (c) { return TT[c] || ""; }).join(", ")) + "</small>" : "") + "</td></tr>"; }).join("");
    var s = $("#owner"); s.hidden = false;
    s.innerHTML = '<div class="card"><div class="scroll"><table class="math owner"><tr><th>Employee</th><th>Box 12 TP</th><th>Box 12 TT</th><th>Box 14b</th></tr>' + rows +
      '<tr class="sum"><td>Total</td><td>' + D.usd(Math.round(tp * 100)) + "</td><td>" + D.usd(Math.round(tt * 100)) + '</td><td></td></tr></table></div></div>' +
      '<p class="muted">TP = cash tips reported to you (card, cash, tip-pool share; never service charges). TT = hours over 40 in each workweek × 0.5 × the regular rate: only the FLSA half, even when double time was paid. 14b = up to two codes, 000 if any tips came in a job not on the IRS list. <a href="https://www.irs.gov/instructions/iw2w3">2026 W-2 instructions</a>. Clover merchants can run the whole year from the register: <a href="/">Tip &amp; Overtime W-2s for Clover</a>.</p>';
    $("#rules").innerHTML = "";
  }

  var pre = "none";
  try {
    var fr = window.__TOW_FRAG;
    if (fr && fr.indexOf("o1.") === 0) { owner(decode(fr)); pre = "owner"; }
    else if (fr && fr.indexOf("w1.") === 0) {
      var x = decode(fr); pre = "worker";
      ["filing_status", "tax_year", "agi"].forEach(function (k) { if (x[k] !== undefined && form.elements[k]) form.elements[k].value = x[k]; });
      if (x.magi && !x.agi) form.elements.agi.value = x.magi;
      if (x.self_employed && x.self_employed[0]) { form.elements.se_tips.value = x.self_employed[0].tips_1099 || ""; form.elements.se_profit.value = x.self_employed[0].net_profit || ""; }
      if (x.ot_1099) form.elements.ot_1099.value = x.ot_1099;
      if (x.valid_ssn === false) form.elements.no_ssn.checked = true;
      setJobs(x.jobs);
    }
  } catch (e) { pre = "bad_link"; }
  window.__TOW_FRAG = null;
  if (pre !== "owner") { if (!jobsEl.children.length) setJobs([]); render(); }
  ph("worksheet_opened", { prefilled: pre });

  // A second link opened in the same tab changes only the fragment: reload so <head> takes it in.
  window.addEventListener("hashchange", function () { if (/^#[wo]1\./.test(location.hash)) location.reload(); });
  form.addEventListener("input", render);
  form.addEventListener("change", render);
  $("#addjob").addEventListener("click", function () { jobsEl.appendChild(jobCard({}, jobsEl.children.length)); });
  jobsEl.addEventListener("click", function (e) { if (e.target.classList.contains("rm")) { e.target.closest(".job").remove(); render(); } });
  $("#print").addEventListener("click", function () { ph("worksheet_printed", { prefilled: pre }); window.print(); });
})();

// "Track expenses" page (password protected — the check happens inside Supabase)
(function () {
  const $ = s => document.querySelector(s);
  const PW_KEY = "et_pw";
  let password = null;
  let rows = [];       // rows returned by the last search
  let shown = [];      // rows after the category filter

  const session = {
    get()  { try { return sessionStorage.getItem(PW_KEY); } catch (e) { return null; } },
    set(p) { try { sessionStorage.setItem(PW_KEY, p); } catch (e) {} },
    clear(){ try { sessionStorage.removeItem(PW_KEY); } catch (e) {} }
  };

  const searchForm = $("#search-form");
  Object.keys(CATEGORIES).forEach(c => searchForm.category.add(new Option(c, c)));

  function showDashboard(on) {
    $("#login").hidden = on;
    $("#dashboard").hidden = !on;
  }

  function lock(message) {
    password = null; rows = []; shown = [];
    session.clear();
    $("#login-form").reset();
    showDashboard(false);
    if (message) toast(message, "error");
  }

  async function unlock(p, silent) {
    if (!db) { if (!silent) toast("Not connected to the database yet — see config.js", "error"); return false; }
    const { data, error } = await db.rpc("verify_password", { p_password: p });
    if (error) { if (!silent) toast(friendlyError(error), "error"); return false; }
    if (data !== true) { if (!silent) toast("Wrong password.", "error"); return false; }
    password = p;
    session.set(p);
    const t = document.getElementById("toast"); if (t) t.hidden = true;
    showDashboard(true);
    loadProjects();
    search();
    return true;
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#login-btn");
    btn.disabled = true; btn.textContent = "Checking…";
    await unlock(e.target.password.value, false);
    btn.disabled = false; btn.textContent = "Unlock";
  });

  $("#lock-btn").addEventListener("click", () => lock());

  // ---------- search ----------
  async function search() {
    const f = searchForm;
    const btn = $("#search-btn");
    btn.disabled = true;
    $("#rows").innerHTML = `<tr><td colspan="12" class="empty">Loading…</td></tr>`;
    const { data, error } = await db.rpc("get_expenses", {
      p_password: password,
      p_project: f.project.value.trim() || null,
      p_from: f.from.value || null,
      p_to: f.to.value || null
    });
    btn.disabled = false;
    if (error) {
      if (/wrong password/i.test(error.message)) return lock("Password changed or incorrect — please unlock again.");
      $("#rows").innerHTML = `<tr><td colspan="12" class="empty">${esc(friendlyError(error))}</td></tr>`;
      return;
    }
    rows = data || [];
    render();
  }

  searchForm.addEventListener("submit", e => { e.preventDefault(); search(); });
  searchForm.category.addEventListener("change", render);

  // ---------- render ----------
  function sumBy(list, key) {
    const m = new Map();
    list.forEach(r => m.set(r[key], (m.get(r[key]) || 0) + Number(r.amount)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }

  function breakdownHTML(pairs, total) {
    if (!pairs.length) return `<li class="muted">No data</li>`;
    return pairs.map(([name, amt]) => {
      const pct = total ? (amt / total) * 100 : 0;
      return `<li><span class="name">${esc(name)}</span><span class="amt">${formatINR(amt)} <span class="muted" style="font-weight:400">· ${pct.toFixed(0)}%</span></span>
        <span class="bar"><span style="width:${pct.toFixed(1)}%"></span></span></li>`;
    }).join("");
  }

  function render() {
    const cat = searchForm.category.value;
    shown = cat ? rows.filter(r => r.category === cat) : rows;
    const total = shown.reduce((s, r) => s + Number(r.amount), 0);
    const projects = new Set(shown.map(r => r.project_name.toLowerCase()));
    const dates = shown.map(r => r.expense_date).sort();
    const range = dates.length ? (dates[0] === dates[dates.length - 1] ? formatDate(dates[0]) : `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`) : "—";

    $("#stats").innerHTML = `
      <div class="stat"><div class="k">Total spent</div><div class="v">${formatINR(total)}</div></div>
      <div class="stat"><div class="k">Entries</div><div class="v">${shown.length}</div></div>
      <div class="stat"><div class="k">Projects</div><div class="v">${projects.size}</div></div>
      <div class="stat"><div class="k">Date range</div><div class="v small">${range}</div></div>`;

    $("#by-category").innerHTML = breakdownHTML(sumBy(shown, "category"), total);
    $("#by-project").innerHTML = breakdownHTML(sumBy(shown, "project_name"), total);

    const q = searchForm.project.value.trim();
    $("#table-title").textContent = q ? `Expenses matching “${q}”` : "All expenses";

    if (!shown.length) {
      $("#rows").innerHTML = `<tr><td colspan="12" class="empty">No expenses found for this search.</td></tr>`;
      $("#foot").innerHTML = "";
      return;
    }

    $("#rows").innerHTML = shown.map(r => `
      <tr>
        <td class="nowrap">${formatDate(r.expense_date)}</td>
        <td>${esc(r.project_name)}</td>
        <td><span class="tag">${esc(r.category)}</span></td>
        <td>${esc(r.label)}</td>
        <td>${esc(r.paid_to)}</td>
        <td class="num">${formatINR(r.amount)}</td>
        <td>${esc(r.payment_mode)}</td>
        <td>${esc(r.approved_by)}</td>
        <td>${esc(r.entered_by)}</td>
        <td class="notes">${esc(r.notes)}</td>
        <td class="nowrap muted">${formatTimestamp(r.created_at)}</td>
        <td><button class="btn small danger" data-del="${r.id}" title="Delete this entry">Delete</button></td>
      </tr>`).join("");
    $("#foot").innerHTML = `<tr><td colspan="5">Total (${shown.length} entries)</td><td class="num">${formatINR(total)}</td><td colspan="6"></td></tr>`;
  }

  // ---------- delete ----------
  $("#rows").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-del]");
    if (!btn) return;
    const r = rows.find(x => String(x.id) === btn.dataset.del);
    if (!r) return;
    const ok = confirm(`Delete this expense permanently?\n\n${r.project_name}\n${formatDate(r.expense_date)} · ${r.paid_to} · ${formatINR(r.amount)}\n\nThis cannot be undone.`);
    if (!ok) return;
    btn.disabled = true;
    const { error } = await db.rpc("delete_expense", { p_password: password, p_id: r.id });
    if (error) { btn.disabled = false; toast(friendlyError(error), "error"); return; }
    toast("Expense deleted");
    search();
  });

  // ---------- CSV export ----------
  $("#csv-btn").addEventListener("click", () => {
    if (!shown.length) { toast("Nothing to download", "error"); return; }
    const cols = [
      ["Date", "expense_date"], ["Project", "project_name"], ["Category", "category"], ["Label", "label"],
      ["Paid to", "paid_to"], ["Amount", "amount"], ["Payment mode", "payment_mode"], ["Approved by", "approved_by"],
      ["Entered by", "entered_by"], ["Notes", "notes"], ["Recorded at", "created_at"]
    ];
    const cell = v => {
      let s = String(v ?? "");
      if (/^[=+\-@]/.test(s)) s = "'" + s;              // stop Excel formula injection
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.map(c => c[0]).join(",")];
    shown.forEach(r => lines.push(cols.map(([, k]) =>
      cell(k === "created_at" ? formatTimestamp(r[k]) : k === "amount" ? Number(r[k]).toFixed(2) : r[k])
    ).join(",")));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const q = searchForm.project.value.trim().replace(/[^\w-]+/g, "_") || "all";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `expenses_${q}_${todayISO()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ---------- change password ----------
  $("#pw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.new1.value !== f.new2.value) { toast("New passwords don't match", "error"); return; }
    const { error } = await db.rpc("change_password", { p_old: f.old.value, p_new: f.new1.value });
    if (error) { toast(friendlyError(error), "error"); return; }
    password = f.new1.value;
    session.set(password);
    f.reset();
    f.closest("details").open = false;
    toast("Password updated");
  });

  // ---------- first-time setup (no password exists yet) ----------
  $("#setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.new1.value !== f.new2.value) { toast("Passwords don't match", "error"); return; }
    const btn = $("#setup-btn");
    btn.disabled = true;
    const { error } = await db.rpc("set_initial_password", { p_new: f.new1.value });
    btn.disabled = false;
    if (error) { toast(friendlyError(error), "error"); return; }
    const p = f.new1.value;
    f.reset();
    $("#setup").hidden = true;
    toast("Password created");
    unlock(p, false);
  });

  // ---------- start: setup, auto-unlock, or show the lock screen ----------
  (async () => {
    if (!db) return;
    const { data: isSet, error } = await db.rpc("password_is_set");
    if (!error && isSet === false) {
      $("#login").hidden = true;
      $("#setup").hidden = false;
      return;
    }
    const saved = session.get();
    if (saved) unlock(saved, true).then(ok => { if (!ok) session.clear(); });
  })();
})();

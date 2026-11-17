// "Track expenses" page — Admin and Entry + View users
(async function () {
  const user = await startPage(["admin", "manager"]);
  if (!user) return;
  const isAdmin = user.role === "admin";
  if (!isAdmin) document.body.classList.add("no-admin");

  const searchForm = $("#search-form");
  let options = { projects: [], categories: [] };
  let rows = [];    // rows from the last search
  let shown = [];   // after category + text filters

  try { options = await loadOptions(); } catch (e) { toast(e.message, "error"); }
  searchForm.project.innerHTML = `<option value="">All projects</option>` +
    options.projects.map(p => `<option value="${esc(p.name)}">${esc(p.name)}${p.active ? "" : " (hidden)"}</option>`).join("");
  searchForm.category.innerHTML = `<option value="">All categories</option>` +
    options.categories.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("");

  // ---------- search ----------
  async function search() {
    const f = searchForm;
    $("#search-btn").disabled = true;
    $("#rows").innerHTML = `<tr><td colspan="12" class="empty">Loading…</td></tr>`;
    try {
      rows = await rpc("get_expenses", {
        p_project: f.project.value || null,
        p_from: f.from.value || null,
        p_to: f.to.value || null
      }) || [];
      render();
    } catch (err) {
      $("#rows").innerHTML = `<tr><td colspan="12" class="empty">${esc(err.message)}</td></tr>`;
    } finally {
      $("#search-btn").disabled = false;
    }
  }
  searchForm.addEventListener("submit", e => { e.preventDefault(); search(); });
  searchForm.project.addEventListener("change", search);
  searchForm.category.addEventListener("change", render);
  searchForm.q.addEventListener("input", render);

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
      return `<li><span class="name">${esc(name)}</span><span class="amt">${formatINR(amt)} <span class="muted pct">· ${pct.toFixed(0)}%</span></span>
        <span class="bar"><span style="width:${pct.toFixed(1)}%"></span></span></li>`;
    }).join("");
  }

  function render() {
    const cat = searchForm.category.value;
    const q = searchForm.q.value.trim().toLowerCase();
    shown = rows.filter(r =>
      (!cat || r.category === cat) &&
      (!q || [r.paid_to, r.notes, r.label, r.approved_by, r.entered_by, r.project_name]
              .some(v => (v || "").toLowerCase().includes(q))));

    const total = shown.reduce((s, r) => s + Number(r.amount), 0);
    const projects = new Set(shown.map(r => r.project_name));
    const dates = shown.map(r => r.expense_date).sort();
    const range = dates.length
      ? (dates[0] === dates[dates.length - 1] ? formatDate(dates[0]) : `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`)
      : "—";

    $("#stats").innerHTML = `
      <div class="stat"><div class="k">Total spent</div><div class="v">${formatINR(total)}</div></div>
      <div class="stat"><div class="k">Entries</div><div class="v">${shown.length}</div></div>
      <div class="stat"><div class="k">Projects</div><div class="v">${projects.size}</div></div>
      <div class="stat"><div class="k">Date range</div><div class="v small">${range}</div></div>`;

    $("#by-category").innerHTML = breakdownHTML(sumBy(shown, "category"), total);
    $("#by-project").innerHTML = breakdownHTML(sumBy(shown, "project_name"), total);
    $("#table-title").textContent = searchForm.project.value ? `Expenses — ${searchForm.project.value}` : "All expenses";

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
        <td class="nowrap muted">${formatTimestamp(r.created_at)}${r.updated_at
          ? `<div class="edited" title="Edited ${esc(formatTimestamp(r.updated_at))}">edited by ${esc(r.updated_by)}</div>` : ""}</td>
        <td class="admin-only nowrap">
          <button class="btn small" data-edit="${r.id}" type="button">Edit</button>
          <button class="btn small danger" data-del="${r.id}" type="button">Delete</button>
        </td>
      </tr>`).join("");
    $("#foot").innerHTML = `<tr><td colspan="5">Total (${shown.length} entries)</td><td class="num">${formatINR(total)}</td><td colspan="6"></td></tr>`;
  }

  // ---------- edit + delete (Admin) ----------
  const dlg = $("#edit-dialog");
  const editForm = $("#edit-form");
  editForm.querySelector(".fields").innerHTML = EXPENSE_FIELDS_HTML;
  let editing = null;

  $("#rows").addEventListener("click", async (e) => {
    const editBtn = e.target.closest("button[data-edit]");
    const delBtn = e.target.closest("button[data-del]");
    if (editBtn) {
      editing = rows.find(x => String(x.id) === editBtn.dataset.edit);
      if (!editing) return;
      setupExpenseForm(editForm, options, editing, { includeInactive: true });
      $("#edit-meta").textContent = `Entered by ${editing.entered_by || "—"} on ${formatTimestamp(editing.created_at)}` +
        (editing.updated_at ? ` · last edited by ${editing.updated_by} on ${formatTimestamp(editing.updated_at)}` : "");
      dlg.showModal();
    }
    if (delBtn) {
      const r = rows.find(x => String(x.id) === delBtn.dataset.del);
      if (!r) return;
      if (!confirm(`Delete this expense permanently?\n\n${r.project_name}\n${formatDate(r.expense_date)} · ${r.paid_to} · ${formatINR(r.amount)}\n\nThis cannot be undone.`)) return;
      delBtn.disabled = true;
      try { await rpc("delete_expense", { p_id: r.id }); toast("Expense deleted"); search(); }
      catch (err) { delBtn.disabled = false; toast(err.message, "error"); }
    }
  });

  $("#edit-cancel").addEventListener("click", () => dlg.close());
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!editing || !validateForm(editForm)) return;
    const btn = $("#edit-save");
    btn.disabled = true;
    try {
      await rpc("update_expense", { p_id: editing.id, p_data: readExpenseForm(editForm) });
      dlg.close();
      toast("Expense updated");
      search();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- CSV export ----------
  $("#csv-btn").addEventListener("click", () => {
    if (!shown.length) { toast("Nothing to download", "error"); return; }
    const cols = [
      ["Date", "expense_date"], ["Project", "project_name"], ["Category", "category"], ["Sub-category", "label"],
      ["Paid to", "paid_to"], ["Amount", "amount"], ["Payment mode", "payment_mode"], ["Approved by", "approved_by"],
      ["Entered by", "entered_by"], ["Notes", "notes"], ["Recorded at", "created_at"],
      ["Last edited by", "updated_by"], ["Last edited at", "updated_at"]
    ];
    const cell = v => {
      let s = String(v ?? "");
      if (/^[=+\-@]/.test(s)) s = "'" + s;   // stop Excel formula injection
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.map(c => c[0]).join(",")];
    shown.forEach(r => lines.push(cols.map(([, k]) =>
      cell(k === "created_at" || k === "updated_at" ? formatTimestamp(r[k]) : k === "amount" ? Number(r[k]).toFixed(2) : r[k])
    ).join(",")));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const name = (searchForm.project.value || "all").replace(/[^\w-]+/g, "_");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `expenses_${name}_${todayISO()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  search();
})();

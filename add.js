// "Add expense" page — every logged-in user
(async function () {
  const user = await startPage(null);
  if (!user) return;

  const form = $("#expense-form");
  const saveBtn = $("#save-btn");
  form.querySelector(".fields").innerHTML = EXPENSE_FIELDS_HTML;

  let options;
  try { options = await loadOptions(); }
  catch (e) { toast(e.message, "error"); return; }

  if (!options.projects.some(p => p.active)) {
    const b = $("#no-projects");
    b.innerHTML = user.role === "admin"
      ? `<strong>No projects yet.</strong> Add your projects in <a href="admin.html">Settings</a> first.`
      : `<strong>No projects yet.</strong> Ask the Admin to add projects.`;
    b.hidden = false;
  }

  setupExpenseForm(form, options, { expense_date: todayISO() });

  $("#clear-btn").addEventListener("click", () => {
    setupExpenseForm(form, options, { project_name: form.project_name.value, expense_date: form.expense_date.value });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateForm(form)) return;
    const payload = readExpenseForm(form);

    saveBtn.disabled = true; saveBtn.textContent = "Saving…";
    try {
      await rpc("add_expense", { p_data: payload });
      toast(`Saved ${formatINR(payload.amount)} for ${payload.project_name}`);
      // Keep project + date for quick multiple entries; clear the rest
      setupExpenseForm(form, options, { project_name: payload.project_name, expense_date: payload.expense_date });
      form.amount.focus();
      loadMine();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      saveBtn.disabled = false; saveBtn.textContent = "Save expense";
    }
  });

  async function loadMine() {
    const body = $("#mine");
    try {
      const rows = await rpc("get_expenses", { p_mine: true, p_limit: 30 });
      if (!rows.length) {
        body.innerHTML = `<tr><td colspan="7" class="empty">You haven't added any expenses yet.</td></tr>`;
        $("#mine-total").textContent = "";
        return;
      }
      body.innerHTML = rows.map(r => `
        <tr>
          <td class="nowrap">${formatDate(r.expense_date)}</td>
          <td>${esc(r.project_name)}</td>
          <td>${esc(r.category)}${r.label ? `<div class="muted sub">${esc(r.label)}</div>` : ""}</td>
          <td>${esc(r.paid_to)}</td>
          <td class="num">${formatINR(r.amount)}</td>
          <td>${esc(r.approved_by)}</td>
          <td class="nowrap muted">${formatTimestamp(r.created_at)}</td>
        </tr>`).join("");
      $("#mine-total").textContent = `Last ${rows.length} entries`;
    } catch (err) {
      body.innerHTML = `<tr><td colspan="7" class="empty">${esc(err.message)}</td></tr>`;
    }
  }
  loadMine();
})();

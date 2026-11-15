// "Add expense" page
(function () {
  const form = document.getElementById("expense-form");
  const saveBtn = document.getElementById("save-btn");
  const labelList = document.getElementById("label-list");

  Object.keys(CATEGORIES).forEach(c => form.category.add(new Option(c, c)));
  PAYMENT_MODES.forEach(m => form.payment_mode.add(new Option(m, m)));

  form.category.addEventListener("change", () => {
    const labels = CATEGORIES[form.category.value] || [];
    labelList.innerHTML = labels.map(l => `<option value="${esc(l)}">`).join("");
    form.label.placeholder = labels.length ? "Type or pick, e.g. " + labels[0] : "Optional";
  });

  function setDefaults() {
    form.expense_date.value = todayISO();
    const who = store.get("et_entered_by");
    if (who) form.entered_by.value = who;
  }
  setDefaults();
  form.addEventListener("reset", () => setTimeout(setDefaults, 0));
  loadProjects();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const v = name => (form[name].value || "").trim();
    for (const name of ["project_name", "paid_to", "approved_by"]) {
      if (!v(name)) { form[name].value = ""; }   // whitespace-only → let browser flag it
    }
    if (!form.reportValidity()) return;

    if (!db) { toast("Not connected to the database yet — see config.js", "error"); return; }

    const payload = {
      project_name: v("project_name"),
      expense_date: v("expense_date"),
      category:     v("category"),
      label:        v("label") || null,
      paid_to:      v("paid_to"),
      amount:       Math.round(Number(form.amount.value) * 100) / 100,
      payment_mode: v("payment_mode") || null,
      approved_by:  v("approved_by"),
      entered_by:   v("entered_by") || null,
      notes:        v("notes") || null
    };

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    const { error } = await db.from("expenses").insert(payload);
    saveBtn.disabled = false;
    saveBtn.textContent = "Save expense";

    if (error) { toast(friendlyError(error), "error"); return; }

    if (payload.entered_by) store.set("et_entered_by", payload.entered_by);
    toast(`Saved ${formatINR(payload.amount)} for ${payload.project_name}`);

    // Keep project + date for quick multiple entries; clear the rest
    const keepProject = payload.project_name, keepDate = payload.expense_date;
    form.reset();
    setTimeout(() => {
      form.project_name.value = keepProject;
      form.expense_date.value = keepDate;
      form.amount.focus();
    }, 0);
    loadProjects();
  });
})();

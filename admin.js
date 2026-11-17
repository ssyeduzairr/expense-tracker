// Settings page — Admin only: users, projects, categories
(async function () {
  const user = await startPage(["admin"]);
  if (!user) return;

  // ---------- tabs ----------
  const tabs = document.querySelectorAll(".tab");
  function showTab(name) {
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach(p => (p.hidden = p.id !== "tab-" + name));
    try { sessionStorage.setItem("et_admin_tab", name); } catch (e) {}
  }
  tabs.forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));
  try { const last = sessionStorage.getItem("et_admin_tab"); if (last) showTab(last); } catch (e) {}

  // Run an admin action with a toast; reload after
  async function act(fn, args, okMsg, reload) {
    try { await rpc(fn, args); if (okMsg) toast(okMsg); await reload(); return true; }
    catch (err) { toast(err.message, "error"); return false; }
  }

  // ======================= USERS =======================
  let users = [];
  async function loadUsers() {
    try { users = await rpc("list_users") || []; }
    catch (err) { $("#users").innerHTML = `<tr><td colspan="5" class="empty">${esc(err.message)}</td></tr>`; return; }
    $("#users").innerHTML = users.map(u => `
      <tr class="${u.active ? "" : "inactive"}">
        <td><strong>${esc(u.full_name)}</strong>${u.id === user.id ? ` <span class="muted">(you)</span>` : ""}</td>
        <td>${esc(u.username)}</td>
        <td><span class="tag role-${esc(u.role)}">${esc(ROLE_LABELS[u.role] || u.role)}</span></td>
        <td>${u.active ? `<span class="status ok">Active</span>` : `<span class="status off">Blocked</span>`}</td>
        <td class="nowrap"><button class="btn small" data-user="${u.id}" type="button">Edit</button></td>
      </tr>`).join("") || `<tr><td colspan="5" class="empty">No users yet.</td></tr>`;
  }

  const udlg = $("#user-dialog"), uform = $("#user-form");
  let editingUser = null;

  function openUser(u) {
    editingUser = u || null;
    uform.reset();
    $("#user-title").textContent = u ? `Edit ${u.full_name}` : "Add user";
    uform.full_name.value = u ? u.full_name : "";
    uform.username.value = u ? u.username : "";
    uform.username.disabled = !!u;               // username can't change
    uform.role.value = u ? u.role : "entry";
    uform.active.checked = u ? u.active : true;
    $("#active-wrap").hidden = !u;
    uform.password.required = !u;
    uform.password.placeholder = u ? "Leave blank to keep current password" : "";
    $("#pw-label").innerHTML = u
      ? `Reset password <span class="muted hint">(optional — type a new one to reset it)</span>`
      : `Password <span class="req">*</span> <span class="muted hint">(8+ characters — tell this person)</span>`;
    const self = u && u.id === user.id;
    uform.role.disabled = !!self;               // can't demote yourself
    uform.active.disabled = !!self;
    udlg.showModal();
  }

  $("#add-user-btn").addEventListener("click", () => openUser(null));
  $("#user-cancel").addEventListener("click", () => udlg.close());
  $("#users").addEventListener("click", e => {
    const b = e.target.closest("button[data-user]");
    if (b) openUser(users.find(u => String(u.id) === b.dataset.user));
  });

  uform.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateForm(uform)) return;
    const btn = $("#user-save");
    btn.disabled = true;
    const ok = await act("save_user", {
      p_id: editingUser ? editingUser.id : null,
      p_username: uform.username.value.trim().toLowerCase(),
      p_full_name: uform.full_name.value.trim(),
      p_role: editingUser && editingUser.id === user.id ? "admin" : uform.role.value,
      p_active: editingUser && editingUser.id === user.id ? true : uform.active.checked,
      p_password: uform.password.value || null
    }, editingUser ? "User updated" : "User created — share the username and password with them", loadUsers);
    btn.disabled = false;
    if (ok) udlg.close();
  });

  // ======================= PROJECTS & CATEGORIES =======================
  let options = { projects: [], categories: [] };
  async function loadOptionsAndRender() {
    try { options = await loadOptions(); }
    catch (err) { toast(err.message, "error"); return; }
    renderProjects();
    renderCategories();
  }

  function itemRow(kind, item, extra = "") {
    return `
      <li class="${item.active ? "" : "inactive"}">
        <span class="item-name">${esc(item.name)}${item.active ? "" : ` <span class="status off">Hidden</span>`}</span>
        <span class="item-actions">
          ${extra}
          <button class="btn small" type="button" data-act="rename" data-kind="${kind}" data-id="${item.id}">Rename</button>
          <button class="btn small" type="button" data-act="toggle" data-kind="${kind}" data-id="${item.id}">${item.active ? "Hide" : "Show"}</button>
          <button class="btn small danger" type="button" data-act="delete" data-kind="${kind}" data-id="${item.id}">Delete</button>
        </span>
      </li>`;
  }

  function renderProjects() {
    $("#projects").innerHTML = options.projects.length
      ? options.projects.map(p => itemRow("project", p)).join("")
      : `<li class="empty">No projects yet — add your first one above.</li>`;
  }

  function renderCategories() {
    $("#categories").innerHTML = options.categories.map(c => `
      <div class="cat-block ${c.active ? "" : "inactive"}">
        <ul class="manage-list cat-head">${itemRow("category", c)}</ul>
        <ul class="manage-list subs">
          ${c.subs.map(s => itemRow("sub", { ...s, category_id: c.id })).join("") || `<li class="empty">No sub-categories</li>`}
        </ul>
        <form class="inline-add small add-sub" data-cat="${c.id}">
          <input name="name" required maxlength="120" placeholder="Add sub-category to ${esc(c.name)}">
          <button class="btn small">Add</button>
        </form>
      </div>`).join("") || `<p class="empty">No categories yet.</p>`;
  }

  function findItem(kind, id) {
    if (kind === "project") return options.projects.find(p => String(p.id) === id);
    if (kind === "category") return options.categories.find(c => String(c.id) === id);
    for (const c of options.categories) {
      const s = c.subs.find(x => String(x.id) === id);
      if (s) return { ...s, category_id: c.id };
    }
  }

  function save(kind, item, name, active) {
    if (kind === "project")  return act("save_project",  { p_id: item.id, p_name: name, p_active: active }, "Saved", loadOptionsAndRender);
    if (kind === "category") return act("save_category", { p_id: item.id, p_name: name, p_active: active }, "Saved", loadOptionsAndRender);
    return act("save_subcategory", { p_id: item.id, p_category_id: item.category_id, p_name: name, p_active: active }, "Saved", loadOptionsAndRender);
  }

  document.querySelector("main").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const kind = b.dataset.kind, item = findItem(kind, b.dataset.id);
    if (!item) return;
    const label = kind === "sub" ? "sub-category" : kind;
    if (b.dataset.act === "rename") {
      const name = prompt(`Rename ${label}:`, item.name);
      if (name && name.trim() && name.trim() !== item.name) save(kind, item, name.trim(), item.active);
    } else if (b.dataset.act === "toggle") {
      save(kind, item, item.name, !item.active);
    } else if (b.dataset.act === "delete") {
      if (!confirm(`Delete ${label} "${item.name}"?` + (kind === "category" ? "\n\nIts sub-categories will be deleted too." : ""))) return;
      const fn = kind === "project" ? "delete_project" : kind === "category" ? "delete_category" : "delete_subcategory";
      act(fn, { p_id: item.id }, "Deleted", loadOptionsAndRender);
    }
  });

  $("#add-project").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    if (await act("save_project", { p_id: null, p_name: name, p_active: true }, `Project "${name}" added`, loadOptionsAndRender)) e.target.reset();
  });

  $("#add-category").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    if (await act("save_category", { p_id: null, p_name: name, p_active: true }, `Category "${name}" added`, loadOptionsAndRender)) e.target.reset();
  });

  $("#categories").addEventListener("submit", async (e) => {
    const f = e.target.closest("form.add-sub");
    if (!f) return;
    e.preventDefault();
    const name = f.name.value.trim();
    if (!name) return;
    await act("save_subcategory", { p_id: null, p_category_id: Number(f.dataset.cat), p_name: name, p_active: true },
      `Sub-category "${name}" added`, loadOptionsAndRender);
  });

  loadUsers();
  loadOptionsAndRender();
})();

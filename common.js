// Shared setup + helpers used by every page
const CFG = window.APP_CONFIG || {};

const IS_CONFIGURED = Boolean(
  CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes("YOUR-PROJECT") &&
  CFG.SUPABASE_ANON_KEY && !CFG.SUPABASE_ANON_KEY.startsWith("YOUR-")
);

const db = IS_CONFIGURED && window.supabase
  ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

const PAYMENT_MODES = ["Cash", "UPI", "Bank transfer", "Cheque", "Card", "Other"];

const ROLE_LABELS = {
  admin:   "Admin (full access)",
  manager: "Entry + View",
  entry:   "Entry only"
};

// ---------- small helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
function formatINR(n) { return inr.format(Number(n) || 0); }

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function todayISO() { return new Date().toLocaleDateString("en-CA"); } // YYYY-MM-DD local

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTimestamp(ts) {
  return ts ? new Date(ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";
}

const store = {
  get(k)    { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  remove(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

let toastTimer;
function toast(msg, type = "success") {
  const el = document.getElementById("toast");
  if (!el) return alert(msg);
  el.textContent = msg;
  el.className = "toast " + type;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

function friendlyError(error) {
  const m = (error && (error.message || error.details)) || String(error);
  if (/failed to fetch|networkerror|load failed/i.test(m)) return "Can't reach the database. Check your internet connection.";
  if (/could not find the function|relation .* does not exist|schema cache/i.test(m)) return "Database isn't set up yet — run supabase/setup.sql in Supabase.";
  if (/invalid api key|jwt/i.test(m)) return "Database key is wrong — check config.js.";
  if (/violates check constraint/i.test(m)) return "Some values are invalid or too long. Please check the form.";
  if (/invalid input syntax/i.test(m)) return "Some values are in the wrong format. Please check the form.";
  return m;
}

// ---------- login session ----------
const TOKEN_KEY = "et_token";
const auth = {
  user: null,
  get token() { return store.get(TOKEN_KEY); },
  save(token) { store.set(TOKEN_KEY, token); },
  clear() { store.remove(TOKEN_KEY); auth.user = null; }
};

// Call a database function. Adds the login token unless noAuth is set.
async function rpc(fn, args = {}, { noAuth = false } = {}) {
  if (!db) throw new Error("Not connected to the database yet — see config.js");
  const params = noAuth ? args : { p_token: auth.token, ...args };
  const { data, error } = await db.rpc(fn, params);
  if (error) {
    if (!noAuth && /session expired/i.test(error.message || "")) {
      auth.clear();
      location.replace("login.html");
    }
    throw new Error(friendlyError(error));
  }
  return data;
}

function homeFor(role) { return role === "entry" ? "index.html" : "track.html"; }

// Start a page that needs login. roles = allowed roles (null = everyone logged in).
async function startPage(roles) {
  const warn = document.getElementById("config-warning");
  if (!IS_CONFIGURED) { if (warn) warn.hidden = false; return null; }
  if (!auth.token) { location.replace("login.html"); return null; }
  let user;
  try {
    user = await rpc("me");
  } catch (e) {
    toast(e.message, "error");
    return null;
  }
  if (roles && !roles.includes(user.role)) { location.replace("index.html"); return null; }
  auth.user = user;
  renderHeader(user);
  document.body.classList.add("ready");
  return user;
}

function renderHeader(user) {
  const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const links = [["index.html", "Add expense"]];
  if (user.role === "admin" || user.role === "manager") links.push(["track.html", "Track expenses"]);
  if (user.role === "admin") links.push(["admin.html", "Settings"]);
  const nav = document.getElementById("nav");
  if (nav) {
    nav.innerHTML = links.map(([href, label]) =>
      `<a href="${href}" class="${page === href ? "active" : ""}">${label}</a>`).join("");
  }
  const box = document.getElementById("userbox");
  if (box) {
    box.innerHTML = `
      <span class="who"><strong>${esc(user.full_name)}</strong><span class="role">${esc(ROLE_LABELS[user.role] || user.role)}</span></span>
      <button class="btn small" id="pw-btn" type="button">Password</button>
      <button class="btn small" id="logout-btn" type="button">Log out</button>`;
    $("#logout-btn").onclick = logout;
    $("#pw-btn").onclick = openPasswordDialog;
  }
  document.querySelectorAll(".brand-name").forEach(el => (el.textContent = CFG.BUSINESS_NAME || "Expense Tracker"));
}

async function logout() {
  try { await rpc("logout"); } catch (e) {}
  auth.clear();
  location.replace("login.html");
}

function openPasswordDialog() {
  let dlg = document.getElementById("pw-dialog");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "pw-dialog";
    dlg.innerHTML = `
      <form method="dialog" class="dialog-body" id="pw-form">
        <h2>Change my password</h2>
        <label class="field"><span>Current password</span><input type="password" name="old" required autocomplete="current-password"></label>
        <label class="field"><span>New password (8+ characters)</span><input type="password" name="new1" required minlength="8" autocomplete="new-password"></label>
        <label class="field"><span>Repeat new password</span><input type="password" name="new2" required minlength="8" autocomplete="new-password"></label>
        <div class="form-actions">
          <button class="btn primary" value="save">Update password</button>
          <button class="btn" value="cancel" formnovalidate>Cancel</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    $("#pw-form", dlg).addEventListener("submit", async (e) => {
      if (e.submitter && e.submitter.value === "cancel") return;
      e.preventDefault();
      const f = e.target;
      if (f.new1.value !== f.new2.value) { toast("New passwords don't match", "error"); return; }
      try {
        await rpc("change_my_password", { p_old: f.old.value, p_new: f.new1.value });
        f.reset(); dlg.close(); toast("Password updated");
      } catch (err) { toast(err.message, "error"); }
    });
  }
  dlg.showModal();
}

// ---------- dropdown lists ----------
async function loadOptions() {
  const o = await rpc("get_options");
  return { projects: o.projects || [], categories: o.categories || [] };
}

function optionTags(items, selected, { includeInactive = false, blank = null } = {}) {
  const list = items.filter(i => i.active || includeInactive || i.name === selected);
  const names = list.map(i => i.name);
  if (selected && !names.includes(selected)) names.push(selected); // keep old value visible
  return (blank !== null ? `<option value="">${esc(blank)}</option>` : "") +
    names.map(n => `<option value="${esc(n)}"${n === selected ? " selected" : ""}>${esc(n)}</option>`).join("");
}

// ---------- the expense form (used on Add page and in the Edit dialog) ----------
const EXPENSE_FIELDS_HTML = `
  <div class="grid">
    <label class="field span-2">
      <span>Project <span class="req">*</span></span>
      <select name="project_name" required></select>
    </label>
    <label class="field">
      <span>Date <span class="req">*</span></span>
      <input type="date" name="expense_date" required>
    </label>
    <label class="field">
      <span>Amount (₹) <span class="req">*</span></span>
      <input type="number" name="amount" required min="0.01" step="0.01" inputmode="decimal" placeholder="0.00">
    </label>
    <label class="field">
      <span>Category <span class="req">*</span></span>
      <select name="category" required></select>
    </label>
    <label class="field">
      <span>Sub-category (label)</span>
      <select name="label"></select>
    </label>
    <label class="field">
      <span>Paid to <span class="req">*</span></span>
      <input name="paid_to" required maxlength="160" placeholder="Person / company">
    </label>
    <label class="field">
      <span>Payment mode</span>
      <select name="payment_mode"></select>
    </label>
    <label class="field span-2">
      <span>Approved by <span class="req">*</span></span>
      <input name="approved_by" required maxlength="120" placeholder="Name">
    </label>
    <label class="field span-2">
      <span>Notes</span>
      <textarea name="notes" rows="2" maxlength="1000" placeholder="Bill no., quantity, anything else…"></textarea>
    </label>
  </div>`;

function setupExpenseForm(form, options, values = {}, { includeInactive = false } = {}) {
  const v = values || {};
  form.project_name.innerHTML = optionTags(options.projects, v.project_name, { includeInactive, blank: "Select a project…" });
  form.category.innerHTML = optionTags(options.categories, v.category, { includeInactive, blank: "Select a category…" });
  form.payment_mode.innerHTML = `<option value="">—</option>` +
    PAYMENT_MODES.map(m => `<option${m === v.payment_mode ? " selected" : ""}>${m}</option>`).join("");

  const fillLabels = (selected) => {
    const cat = options.categories.find(c => c.name === form.category.value);
    const subs = cat ? cat.subs : [];
    form.label.innerHTML = optionTags(subs, selected, { includeInactive, blank: subs.length ? "— none —" : "— no sub-categories —" });
  };
  form.category.onchange = () => fillLabels(null);
  fillLabels(v.label);

  form.expense_date.value = v.expense_date || todayISO();
  form.amount.value = v.amount ?? "";
  form.paid_to.value = v.paid_to || "";
  form.approved_by.value = v.approved_by || "";
  form.notes.value = v.notes || "";
}

function readExpenseForm(form) {
  const t = n => (form[n].value || "").trim();
  return {
    project_name: t("project_name"),
    expense_date: t("expense_date"),
    category:     t("category"),
    label:        t("label") || null,
    paid_to:      t("paid_to"),
    amount:       Math.round(Number(form.amount.value) * 100) / 100,
    payment_mode: t("payment_mode") || null,
    approved_by:  t("approved_by"),
    notes:        t("notes") || null
  };
}

// Browser required-check, plus "spaces only" counts as empty
function validateForm(form) {
  form.querySelectorAll("input[required], textarea[required]").forEach(el => {
    if (!el.value.trim()) el.value = "";
  });
  return form.reportValidity();
}

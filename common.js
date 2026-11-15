// Shared setup + helpers used by both pages
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

// Categories → suggested labels (sub-categories). Edit freely.
const CATEGORIES = {
  "Land & Property":        ["Land purchase", "Advance / token", "Stamp duty", "Registration", "Mutation / khata"],
  "Construction Material":  ["Cement", "Steel / TMT", "Sand", "Bricks / blocks", "Aggregate / jelly", "Tiles", "Paint", "Plumbing material", "Electrical material", "Wood / doors"],
  "Labour & Contractor":    ["Labour wages", "Mason", "Carpenter", "Plumber", "Electrician", "Painter", "Contractor bill"],
  "Legal & Approvals":      ["Lawyer fees", "Plan approval", "RERA", "Building permit", "NOC", "Survey"],
  "Government Fees & Taxes":["Property tax", "GST", "Development charges", "Betterment fee"],
  "Brokerage & Commission": ["Broker commission", "Referral"],
  "Marketing & Sales":      ["Ads", "Hoardings / banners", "Brochures", "Online listing", "Site visit"],
  "Utilities":              ["Electricity", "Water", "Borewell", "Phone / internet"],
  "Transport & Fuel":       ["Fuel", "Vehicle hire", "Material transport"],
  "Machinery & Equipment":  ["JCB / excavator", "Equipment rent", "Tools", "Machine repair"],
  "Office & Admin":         ["Rent", "Salaries", "Stationery", "Tea / refreshments", "Bank charges"],
  "Maintenance & Repairs":  ["Repairs", "Cleaning", "Security / watchman"],
  "Other":                  []
};

const PAYMENT_MODES = ["Cash", "UPI", "Bank transfer", "Cheque", "Card", "Other"];

// ---------- helpers ----------
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
function formatINR(n) { return inr.format(Number(n) || 0); }

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function todayISO() { return new Date().toLocaleDateString("en-CA"); } // YYYY-MM-DD in local time

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTimestamp(ts) {
  return ts ? new Date(ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";
}

const store = {
  get(k)    { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

let toastTimer;
function toast(msg, type = "success") {
  const el = document.getElementById("toast");
  if (!el) return alert(msg);
  el.textContent = msg;
  el.className = "toast " + type;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

function friendlyError(error) {
  const m = (error && (error.message || error.details)) || String(error);
  if (/wrong password/i.test(m)) return "Wrong password.";
  if (/failed to fetch|networkerror|load failed/i.test(m)) return "Can't reach the database. Check your internet connection.";
  if (/could not find the function|relation .* does not exist|schema cache/i.test(m)) return "Database isn't set up yet — run supabase/setup.sql in Supabase.";
  if (/invalid api key|jwt/i.test(m)) return "Database key is wrong — check config.js.";
  if (/violates check constraint/i.test(m)) return "Some values are invalid or too long. Please check the form.";
  return m;
}

async function loadProjects() {
  const list = document.getElementById("project-list");
  if (!db || !list) return;
  const { data, error } = await db.rpc("list_projects");
  if (error || !Array.isArray(data)) return;
  list.innerHTML = data.map(p => `<option value="${esc(typeof p === "string" ? p : Object.values(p)[0])}">`).join("");
}

// Page chrome: business name + "not connected" banner
document.addEventListener("DOMContentLoaded", () => {
  const name = CFG.BUSINESS_NAME || "Expense Tracker";
  document.querySelectorAll(".brand-name").forEach(el => (el.textContent = name));
  const warn = document.getElementById("config-warning");
  if (warn && !IS_CONFIGURED) warn.hidden = false;
});

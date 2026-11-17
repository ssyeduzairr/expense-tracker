// Login page (+ first-time Admin setup)
(async function () {
  document.querySelectorAll(".brand-name").forEach(el => (el.textContent = CFG.BUSINESS_NAME || "Expense Tracker"));
  if (!IS_CONFIGURED) { $("#config-warning").hidden = false; return; }

  // Already logged in? Go straight in.
  if (auth.token) {
    try { const u = await rpc("me"); location.replace(homeFor(u.role)); return; }
    catch (e) { auth.clear(); }
  }

  let setupNeeded = false;
  try { setupNeeded = await rpc("setup_needed", {}, { noAuth: true }); }
  catch (e) { toast(e.message, "error"); }
  $(setupNeeded ? "#setup" : "#login").hidden = false;

  function enter(result) {
    auth.save(result.token);
    location.replace(homeFor(result.user.role));
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, btn = $("#login-btn");
    btn.disabled = true; btn.textContent = "Checking…";
    try {
      enter(await rpc("login", { p_username: f.username.value.trim(), p_password: f.password.value }, { noAuth: true }));
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false; btn.textContent = "Log in";
    }
  });

  $("#setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.new1.value !== f.new2.value) { toast("Passwords don't match", "error"); return; }
    const btn = $("#setup-btn");
    btn.disabled = true;
    try {
      enter(await rpc("setup_admin", {
        p_username: f.username.value.trim().toLowerCase(),
        p_full_name: f.full_name.value.trim(),
        p_password: f.new1.value
      }, { noAuth: true }));
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
    }
  });
})();

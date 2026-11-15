# Real Estate Expense Tracker

A simple website with two pages:

| Page | Who uses it | What it does |
|---|---|---|
| **Add expense** (`index.html`) | Anyone with the link | Fill in project name, date, category, label (sub-category), paid to, amount, payment mode, approved by, entered by, notes. Time of entry is saved automatically. |
| **Track expenses** (`track.html`) | Main expense handler (password) | Search by project name / date / category, see totals by category and project, delete wrong entries, download CSV for Excel, change the password. |

**Cost: ₹0.** Database = Supabase free plan. Website hosting = GitHub Pages (free) or Netlify (free).

---

## Step 1 — Create the free database (Supabase) · ~5 min

1. Go to <https://supabase.com> → **Start your project** → sign up (GitHub or email). No card needed.
2. Click **New project**. Give it a name (e.g. `expenses`), set a database password (save it somewhere — you won't need it day to day), choose region **Mumbai (ap-south-1)**, plan **Free**. Click **Create**.
3. When it finishes, open **SQL Editor** (left sidebar) → **New query**.
4. Open `supabase/setup.sql` from this folder, copy everything, paste it in.
5. Click **Run** (confirm if Supabase warns about "destructive operations"). You should see *Success. No rows returned*.
6. The Track-page password is **not** set here: the first time you open `track.html` it asks you to **create** it (this works only once).

## Step 2 — Connect the website to the database · ~1 min

1. In Supabase go to **Project Settings → API** (or **Data API** / **API Keys**).
2. Copy the **Project URL** (looks like `https://abcdxyz.supabase.co`).
3. Copy the **anon public** key (or the **publishable** key, starts with `sb_publishable_`).
4. Open `config.js` and paste them in:

   ```js
   SUPABASE_URL: "https://abcdxyz.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGciOi....",
   BUSINESS_NAME: "Sharma Real Estate Expenses",
   ```

> ✅ The anon/publishable key is designed to be public — it's fine for it to be in the website.
> ❌ Never paste the `service_role` / `secret` key anywhere in this project.

**Test it locally:** double-click `index.html` to open it in your browser, add a test expense, then open `track.html`, create/enter your password and search.

## Step 3 — Put it on the internet for free

### Option A: GitHub Pages (recommended — permanent, free)

1. Create a free account at <https://github.com>.
2. Click **+ → New repository**. Name it e.g. `expenses`. Choose **Public** (Pages is free for public repos — the data is NOT in the code, it's safely in Supabase). Click **Create repository**.
3. Click **uploading an existing file**, then drag **all the files and folders** from this folder (`index.html`, `track.html`, `add.js`, `track.js`, `common.js`, `config.js`, `style.css`, `supabase/`, `.github/`) into the page. Click **Commit changes**.
   - Tip: the `.github` folder is hidden on some computers. If it doesn't upload, skip it — it's only the optional "keep awake" helper (see below).
4. Go to **Settings → Pages**. Under *Build and deployment*, Source = **Deploy from a branch**, Branch = **main**, folder **/ (root)** → **Save**.
5. Wait ~1 minute. Your site is live at:
   **`https://<your-github-username>.github.io/expenses/`**
   The track page is at `.../expenses/track.html`.

### Option B: Netlify (drag & drop)

1. Sign up free at <https://app.netlify.com>.
2. Go to **Sites → Add new site → Deploy manually** and drag this whole folder onto the page.
3. You get a link like `https://random-name.netlify.app` (you can rename it under *Site configuration → Change site name*).

To update the site later: on GitHub, upload the changed file again; on Netlify, drag the folder again.

---

## Good to know

- **Supabase free projects pause after ~7 days of no use.** If the site says it can't reach the database, open your Supabase dashboard and click **Restore project**. The included GitHub Action (`.github/workflows/keep-supabase-awake.yml`) pings the database every 3 days to prevent this automatically — it works on its own once the files are on GitHub. You can test it from the repo's **Actions** tab → *Keep Supabase awake* → **Run workflow**.
- **How the password works:** the password is checked inside the database (stored as a bcrypt hash), not in the website code — so nobody can read expenses by looking at the page source or calling the database directly. Wrong guesses are slowed down. Use a strong password.
- **The Add page is open to anyone with the link** (as requested). Only share the link with people who should add expenses. Junk entries can be deleted from the Track page.
- **Forgot the password?** In Supabase → SQL Editor run:
  ```sql
  update public.app_settings
  set password_hash = extensions.crypt('YourNewPassword', extensions.gen_salt('bf', 10))
  where id = 1;
  ```
- **Backups / Excel:** use *Download CSV* on the Track page (opens in Excel). You can also see all data in Supabase → **Table Editor → expenses**.
- **Change categories / sub-categories:** edit the `CATEGORIES` list at the top of `common.js`.
- **Free limits:** Supabase free = 500 MB database (roughly a million+ expense rows) — far more than needed.

## Files

```
index.html     Add-expense page
track.html     Track/search page (password)
add.js         Logic for the add page
track.js       Logic for the track page
common.js      Shared settings: categories, payment modes, helpers
config.js      ← your Supabase URL + key go here
style.css      Look & feel (works on phone and computer, light/dark)
supabase/setup.sql                      Run once in Supabase
.github/workflows/keep-supabase-awake.yml  Optional free keep-alive
```

# Real Estate Expense Tracker

A simple, free website for recording and tracking project expenses, with a login for each person.

**Live site:** https://ssyeduzairr.github.io/expense-tracker/

**Cost: ₹0.** Database = Supabase free plan. Website hosting = GitHub Pages (free).

---

## User types

| User type | Add expenses | See expenses | Edit / delete | Manage users, projects, categories |
|---|:-:|:-:|:-:|:-:|
| **Admin (full access)** | ✅ | ✅ all | ✅ | ✅ |
| **Entry + View** | ✅ | ✅ all + totals | ❌ | ❌ |
| **Entry only** | ✅ | only their own | ❌ | ❌ |

- Everyone logs in with a **username + password** created by the Admin (no email needed).
- "Entered by" and the time are recorded automatically from the login.
- When the Admin edits an entry, the table shows **"edited by …"** with the time.

## Pages

| Page | Who | What |
|---|---|---|
| `login.html` | everyone | Log in. The very first visit asks to create the Admin account. |
| `index.html` — Add expense | everyone | Project, date, amount, category, sub-category, paid to, payment mode, approved by, notes. Below it: "My recent entries". |
| `track.html` — Track expenses | Admin, Entry + View | Filter by project / dates / category / text; totals by category & project; download CSV for Excel. Admin also gets **Edit** and **Delete**. |
| `admin.html` — Settings | Admin | **Users** (add, change type, block, reset password), **Projects** (add, rename, hide), **Categories & sub-categories** (add, rename, hide, delete). |

## Where is the data stored?

In a **PostgreSQL database** hosted by **Supabase** (a real database, not an Excel file).
- Nobody can read or change it directly. Every action goes through checked functions that verify the login and the user type.
- Passwords are stored only as secure hashes (bcrypt), never as plain text.
- To get an Excel copy: **Track expenses → Download CSV (Excel)**. Do this now and then as a backup.
- The Admin can also see the raw tables in the Supabase dashboard → **Table Editor**.

## Day-to-day tasks (Admin)

- **Add a person:** Settings → Users → **+ Add user**. Pick the user type, set a password, and tell them their username + password.
- **Someone forgot their password:** Settings → Users → **Edit** → type a new password → Save.
- **Someone left:** Settings → Users → **Edit** → untick "Account active". They are logged out immediately.
- **New project:** Settings → Projects → Add. When a project is finished, click **Hide** (its expenses stay).
- **New category / sub-category:** Settings → Categories.
- **Fix a wrong entry:** Track expenses → **Edit**.

Renaming a project, category or sub-category also updates the old entries. Items already used in expenses can be hidden but not deleted.

## If the Admin forgets their own password

Another Admin can reset it in Settings. If there's no other Admin, open Supabase → **SQL Editor** and run (change the username and password):

```sql
update public.app_users
set password_hash = extensions.crypt('NewPassword123', extensions.gen_salt('bf', 10)), active = true
where username = 'your-admin-username';
```

---

## Setting it up from scratch (only needed for a brand-new copy)

1. Create a free project at <https://supabase.com> (region **Mumbai**).
2. Supabase → **SQL Editor** → New query → paste all of `supabase/setup.sql` → **Run** (confirm the "destructive operations" warning). It's safe to run again later. It never deletes expenses.
3. Supabase → **Project Settings → API Keys**: copy the Project URL and the **publishable** key into `config.js`. Never put the **secret** key in this project.
4. Put the files on GitHub and turn on **Settings → Pages** (branch `main`, folder `/ (root)`).
5. Open the site → create the Admin account → add projects and users in Settings.

## Good to know

- **Supabase free projects pause after ~7 days of no use.** The included GitHub Action (`.github/workflows/keep-supabase-awake.yml`) pings the database every 3 days to prevent this. If the site ever says it can't reach the database, open the Supabase dashboard and click **Restore project**.
- **Free limits:** 500 MB database (over a million expense rows), far more than needed.
- **Payment modes** (Cash, UPI, …) can be edited in `PAYMENT_MODES` at the top of `common.js`.

## Files

```
login.html / login.js     Log in + first-time Admin setup
index.html / add.js       Add expense + "My recent entries"
track.html / track.js     Track, filter, totals, edit/delete (Admin), CSV
admin.html / admin.js     Settings: users, projects, categories
common.js                 Shared: login session, menus, expense form, helpers
config.js                 Supabase URL + publishable key
style.css                 Look & feel (phone + computer, light/dark)
supabase/setup.sql        Database tables, security and functions
.github/workflows/keep-supabase-awake.yml   Free keep-alive
```

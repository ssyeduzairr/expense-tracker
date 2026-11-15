-- =====================================================================
--  Expense Tracker — Supabase setup
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--
--  The Track-page password is created on the website the first time
--  you open track.html (not in this file).
--
--  Safe to run again later — it will not delete any expenses.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Expenses table
-- ---------------------------------------------------------------------
create table if not exists public.expenses (
  id            bigint generated always as identity primary key,
  project_name  text          not null check (length(trim(project_name)) between 1 and 120),
  expense_date  date          not null,
  category      text          not null check (length(category) between 1 and 80),
  label         text                   check (length(label) <= 120),          -- sub-category
  paid_to       text          not null check (length(trim(paid_to)) between 1 and 160),
  amount        numeric(14,2) not null check (amount > 0 and amount < 10000000000),
  payment_mode  text                   check (length(payment_mode) <= 40),
  approved_by   text          not null check (length(trim(approved_by)) between 1 and 120),
  entered_by    text                   check (length(entered_by) <= 120),
  notes         text                   check (length(notes) <= 1000),
  created_at    timestamptz   not null default now()                           -- automatic timestamp
);

create index if not exists expenses_project_idx on public.expenses (lower(project_name));
create index if not exists expenses_date_idx    on public.expenses (expense_date desc);

-- Anyone with the website can ADD an expense, but nobody can read, edit
-- or delete rows directly. Reading only happens through the
-- password-checked functions below.
alter table public.expenses enable row level security;

drop policy if exists "anyone can add expenses" on public.expenses;
create policy "anyone can add expenses"
  on public.expenses for insert
  to anon, authenticated
  with check (true);

revoke all    on public.expenses from anon, authenticated;
grant  insert on public.expenses to   anon, authenticated;
grant  usage  on schema public   to   anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Password storage (only a bcrypt hash is stored, never the password)
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  id            int  primary key default 1 check (id = 1),
  password_hash text not null
);
alter table public.app_settings enable row level security;   -- no policies = no public access
revoke all on public.app_settings from anon, authenticated;

-- No password is stored here. The first time anyone opens the Track page,
-- it asks to CREATE the password (works only once, while none exists).

-- ---------------------------------------------------------------------
-- 3. Functions the website calls
-- ---------------------------------------------------------------------

-- Internal helper (not callable from the website)
create or replace function public._password_ok(p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare ok boolean;
begin
  select exists (
    select 1 from public.app_settings
    where id = 1 and password_hash = extensions.crypt(coalesce(p_password, ''), password_hash)
  ) into ok;
  if not ok then
    perform pg_sleep(1);          -- slows down password guessing
  end if;
  return ok;
end $$;

-- Login check for the Track page
create or replace function public.verify_password(p_password text)
returns boolean
language sql
security definer
set search_path = public
as $$ select public._password_ok(p_password); $$;

-- Search expenses (password required)
create or replace function public.get_expenses(
  p_password text,
  p_project  text default null,
  p_from     date default null,
  p_to       date default null
)
returns setof public.expenses
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._password_ok(p_password) then
    raise exception 'Wrong password' using errcode = '28P01';
  end if;

  return query
    select * from public.expenses e
    where (coalesce(trim(p_project), '') = '' or e.project_name ilike '%' || trim(p_project) || '%')
      and (p_from is null or e.expense_date >= p_from)
      and (p_to   is null or e.expense_date <= p_to)
    order by e.expense_date desc, e.created_at desc
    limit 5000;
end $$;

-- Delete a wrong entry (password required)
create or replace function public.delete_expense(p_password text, p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._password_ok(p_password) then
    raise exception 'Wrong password' using errcode = '28P01';
  end if;
  delete from public.expenses where id = p_id;
  return found;
end $$;

-- Change the password from the website (old password required)
create or replace function public.change_password(p_old text, p_new text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public._password_ok(p_old) then
    raise exception 'Wrong password' using errcode = '28P01';
  end if;
  if length(coalesce(p_new, '')) < 8 then
    raise exception 'New password must be at least 8 characters';
  end if;
  update public.app_settings
     set password_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10))
   where id = 1;
  return true;
end $$;

-- Has the Track-page password been created yet?
create or replace function public.password_is_set()
returns boolean
language sql
security definer
set search_path = public
as $$ select exists (select 1 from public.app_settings where id = 1); $$;

-- First-time setup: create the password. Refuses once a password exists.
create or replace function public.set_initial_password(p_new text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.app_settings where id = 1) then
    raise exception 'Password is already set';
  end if;
  if length(coalesce(p_new, '')) < 8 then
    raise exception 'New password must be at least 8 characters';
  end if;
  insert into public.app_settings (id, password_hash)
  values (1, extensions.crypt(p_new, extensions.gen_salt('bf', 10)));
  return true;
end $$;

-- Project names for the auto-suggest box (names only, no amounts)
create or replace function public.list_projects()
returns setof text
language sql
security definer
set search_path = public
as $$
  select distinct on (lower(project_name)) project_name
  from public.expenses
  order by lower(project_name), created_at desc;
$$;

-- ---------------------------------------------------------------------
-- 4. Permissions on functions
-- ---------------------------------------------------------------------
revoke execute on function public._password_ok(text) from public, anon, authenticated;

revoke execute on function public.verify_password(text)                  from public;
revoke execute on function public.get_expenses(text, text, date, date)   from public;
revoke execute on function public.delete_expense(text, bigint)           from public;
revoke execute on function public.change_password(text, text)            from public;
revoke execute on function public.list_projects()                        from public;
revoke execute on function public.password_is_set()                      from public;
revoke execute on function public.set_initial_password(text)             from public;
grant  execute on function public.password_is_set()                      to anon, authenticated;
grant  execute on function public.set_initial_password(text)             to anon, authenticated;

grant execute on function public.verify_password(text)                  to anon, authenticated;
grant execute on function public.get_expenses(text, text, date, date)   to anon, authenticated;
grant execute on function public.delete_expense(text, bigint)           to anon, authenticated;
grant execute on function public.change_password(text, text)            to anon, authenticated;
grant execute on function public.list_projects()                        to anon, authenticated;

-- Done! You should see "Success. No rows returned".

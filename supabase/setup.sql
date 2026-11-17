-- =====================================================================
--  Expense Tracker — Supabase setup (v2: user logins + roles)
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--  Safe to run again: it never deletes expenses.
--
--  Roles:
--    admin    = full access (add, view all, edit, delete, users, projects, categories)
--    manager  = "Entry + View" (add, view all; no edit/delete)
--    entry    = "Entry only"   (add, view only their own entries)
--
--  The first time the website is opened, it asks to create the Admin account.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Tables
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
  created_at    timestamptz   not null default now()
);
alter table public.expenses add column if not exists created_by bigint;       -- user id
alter table public.expenses add column if not exists updated_at timestamptz;  -- last edit time
alter table public.expenses add column if not exists updated_by text;         -- last editor's name

create index if not exists expenses_project_idx on public.expenses (lower(project_name));
create index if not exists expenses_date_idx    on public.expenses (expense_date desc);
create index if not exists expenses_creator_idx on public.expenses (created_by);

create table if not exists public.app_users (
  id            bigint generated always as identity primary key,
  username      text not null unique check (username ~ '^[a-z0-9._-]{3,30}$'),
  full_name     text not null check (length(trim(full_name)) between 1 and 80),
  role          text not null check (role in ('admin', 'manager', 'entry')),
  password_hash text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.sessions (
  token_hash text primary key,
  user_id    bigint not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

create table if not exists public.projects (
  id         bigint generated always as identity primary key,
  name       text not null check (length(trim(name)) between 1 and 120),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists projects_name_uq on public.projects (lower(name));

create table if not exists public.categories (
  id     bigint generated always as identity primary key,
  name   text not null check (length(trim(name)) between 1 and 80),
  active boolean not null default true,
  sort   int not null default 100
);
create unique index if not exists categories_name_uq on public.categories (lower(name));

create table if not exists public.subcategories (
  id          bigint generated always as identity primary key,
  category_id bigint not null references public.categories(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 120),
  active      boolean not null default true
);
create unique index if not exists subcategories_name_uq on public.subcategories (category_id, lower(name));

-- ---------------------------------------------------------------------
-- 2. Lock everything down: the website can only use the functions below
-- ---------------------------------------------------------------------
alter table public.expenses      enable row level security;
alter table public.app_users     enable row level security;
alter table public.sessions      enable row level security;
alter table public.projects      enable row level security;
alter table public.categories    enable row level security;
alter table public.subcategories enable row level security;

drop policy if exists "anyone can add expenses" on public.expenses;
revoke all on public.expenses, public.app_users, public.sessions,
              public.projects, public.categories, public.subcategories
  from anon, authenticated;

-- Remove the old single-password system (v1)
drop function if exists public.verify_password(text);
drop function if exists public.get_expenses(text, text, date, date);
drop function if exists public.delete_expense(text, bigint);
drop function if exists public.change_password(text, text);
drop function if exists public.set_initial_password(text);
drop function if exists public.password_is_set();
drop function if exists public.list_projects();
drop function if exists public._password_ok(text);
drop table    if exists public.app_settings;

-- ---------------------------------------------------------------------
-- 3. Starter data (only when the lists are empty)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.categories) then
    insert into public.categories (name, sort) values
      ('Land & Property', 10), ('Construction Material', 20), ('Labour & Contractor', 30),
      ('Legal & Approvals', 40), ('Government Fees & Taxes', 50), ('Brokerage & Commission', 60),
      ('Marketing & Sales', 70), ('Utilities', 80), ('Transport & Fuel', 90),
      ('Machinery & Equipment', 100), ('Office & Admin', 110), ('Maintenance & Repairs', 120),
      ('Other', 130);

    insert into public.subcategories (category_id, name)
    select c.id, s.sub
    from (values
      ('Land & Property','Land purchase'), ('Land & Property','Advance / token'), ('Land & Property','Stamp duty'),
      ('Land & Property','Registration'), ('Land & Property','Mutation / khata'),
      ('Construction Material','Cement'), ('Construction Material','Steel / TMT'), ('Construction Material','Sand'),
      ('Construction Material','Bricks / blocks'), ('Construction Material','Aggregate / jelly'), ('Construction Material','Tiles'),
      ('Construction Material','Paint'), ('Construction Material','Plumbing material'), ('Construction Material','Electrical material'),
      ('Construction Material','Wood / doors'),
      ('Labour & Contractor','Labour wages'), ('Labour & Contractor','Mason'), ('Labour & Contractor','Carpenter'),
      ('Labour & Contractor','Plumber'), ('Labour & Contractor','Electrician'), ('Labour & Contractor','Painter'),
      ('Labour & Contractor','Contractor bill'),
      ('Legal & Approvals','Lawyer fees'), ('Legal & Approvals','Plan approval'), ('Legal & Approvals','RERA'),
      ('Legal & Approvals','Building permit'), ('Legal & Approvals','NOC'), ('Legal & Approvals','Survey'),
      ('Government Fees & Taxes','Property tax'), ('Government Fees & Taxes','GST'),
      ('Government Fees & Taxes','Development charges'), ('Government Fees & Taxes','Betterment fee'),
      ('Brokerage & Commission','Broker commission'), ('Brokerage & Commission','Referral'),
      ('Marketing & Sales','Ads'), ('Marketing & Sales','Hoardings / banners'), ('Marketing & Sales','Brochures'),
      ('Marketing & Sales','Online listing'), ('Marketing & Sales','Site visit'),
      ('Utilities','Electricity'), ('Utilities','Water'), ('Utilities','Borewell'), ('Utilities','Phone / internet'),
      ('Transport & Fuel','Fuel'), ('Transport & Fuel','Vehicle hire'), ('Transport & Fuel','Material transport'),
      ('Machinery & Equipment','JCB / excavator'), ('Machinery & Equipment','Equipment rent'),
      ('Machinery & Equipment','Tools'), ('Machinery & Equipment','Machine repair'),
      ('Office & Admin','Rent'), ('Office & Admin','Salaries'), ('Office & Admin','Stationery'),
      ('Office & Admin','Tea / refreshments'), ('Office & Admin','Bank charges'),
      ('Maintenance & Repairs','Repairs'), ('Maintenance & Repairs','Cleaning'), ('Maintenance & Repairs','Security / watchman')
    ) as s(cat, sub)
    join public.categories c on c.name = s.cat
    on conflict do nothing;

    -- Categories already used in old entries
    insert into public.categories (name, sort)
    select distinct category, 200 from public.expenses
    on conflict do nothing;
  end if;

  if not exists (select 1 from public.projects) then
    insert into public.projects (name)
    select distinct on (lower(project_name)) project_name from public.expenses
    order by lower(project_name), created_at desc
    on conflict do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Internal helpers (not callable from the website)
-- ---------------------------------------------------------------------
create or replace function public._auth(p_token text, p_roles text[] default null)
returns public.app_users
language plpgsql security definer set search_path = public, extensions
as $$
declare u public.app_users;
begin
  select a.* into u
  from public.sessions s join public.app_users a on a.id = s.user_id
  where s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.expires_at > now() and a.active;
  if not found then
    raise exception 'Session expired' using errcode = '28000';
  end if;
  if p_roles is not null and not (u.role = any (p_roles)) then
    raise exception 'You are not allowed to do this' using errcode = '42501';
  end if;
  return u;
end $$;

create or replace function public._user_json(u public.app_users)
returns json language sql immutable
as $$ select json_build_object('id', u.id, 'username', u.username, 'full_name', u.full_name, 'role', u.role); $$;

create or replace function public._new_session(p_user_id bigint)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare t text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from public.sessions where expires_at < now();
  insert into public.sessions (token_hash, user_id)
  values (encode(extensions.digest(t, 'sha256'), 'hex'), p_user_id);
  return t;
end $$;

create or replace function public._expense_from_json(p_data json, p_new boolean)
returns public.expenses
language plpgsql security definer set search_path = public
as $$
declare
  e public.expenses;
  v_project  text := nullif(trim(p_data->>'project_name'), '');
  v_category text := nullif(trim(p_data->>'category'), '');
  v_label    text := nullif(trim(p_data->>'label'), '');
begin
  select name into e.project_name from public.projects
   where lower(name) = lower(v_project) and (active or not p_new);
  if e.project_name is null then raise exception 'Please choose a valid project'; end if;

  select name into e.category from public.categories
   where lower(name) = lower(v_category) and (active or not p_new);
  if e.category is null then raise exception 'Please choose a valid category'; end if;

  if v_label is not null then
    select s.name into e.label
    from public.subcategories s join public.categories c on c.id = s.category_id
    where lower(c.name) = lower(e.category) and lower(s.name) = lower(v_label) and (s.active or not p_new);
    if e.label is null then raise exception 'Please choose a valid sub-category'; end if;
  end if;

  e.expense_date := nullif(p_data->>'expense_date', '')::date;
  e.amount       := round(nullif(p_data->>'amount', '')::numeric, 2);
  e.paid_to      := nullif(trim(p_data->>'paid_to'), '');
  e.payment_mode := nullif(trim(p_data->>'payment_mode'), '');
  e.approved_by  := nullif(trim(p_data->>'approved_by'), '');
  e.notes        := nullif(trim(p_data->>'notes'), '');

  if e.expense_date is null then raise exception 'Please enter the date'; end if;
  if e.amount is null or e.amount <= 0 then raise exception 'Amount must be more than 0'; end if;
  if e.paid_to is null then raise exception 'Please enter who was paid'; end if;
  if e.approved_by is null then raise exception 'Please enter who approved it'; end if;
  return e;
end $$;

-- ---------------------------------------------------------------------
-- 5. Login & account
-- ---------------------------------------------------------------------
create or replace function public.setup_needed()
returns boolean language sql security definer set search_path = public
as $$ select not exists (select 1 from public.app_users); $$;

-- First-time only: create the Admin account (refuses once any user exists)
create or replace function public.setup_admin(p_username text, p_full_name text, p_password text)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare u public.app_users;
begin
  lock table public.app_users in exclusive mode;
  if exists (select 1 from public.app_users) then
    raise exception 'Setup is already done. Please log in.';
  end if;
  if lower(trim(coalesce(p_username, ''))) !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Username must be 3-30 letters or numbers, no spaces';
  end if;
  if nullif(trim(p_full_name), '') is null then raise exception 'Please enter your name'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters'; end if;

  insert into public.app_users (username, full_name, role, password_hash)
  values (lower(trim(p_username)), trim(p_full_name), 'admin', extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
  returning * into u;
  return json_build_object('token', public._new_session(u.id), 'user', public._user_json(u));
end $$;

create or replace function public.login(p_username text, p_password text)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare u public.app_users;
begin
  select * into u from public.app_users where username = lower(trim(coalesce(p_username, ''))) and active;
  if not found or u.password_hash <> extensions.crypt(coalesce(p_password, ''), u.password_hash) then
    perform pg_sleep(1);   -- slows down password guessing
    raise exception 'Wrong username or password';
  end if;
  return json_build_object('token', public._new_session(u.id), 'user', public._user_json(u));
end $$;

create or replace function public.logout(p_token text)
returns void language sql security definer set search_path = public, extensions
as $$ delete from public.sessions where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'); $$;

create or replace function public.me(p_token text)
returns json language plpgsql security definer set search_path = public
as $$ begin return public._user_json(public._auth(p_token)); end $$;

create or replace function public.change_my_password(p_token text, p_old text, p_new text)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare u public.app_users;
begin
  u := public._auth(p_token);
  if u.password_hash <> extensions.crypt(coalesce(p_old, ''), u.password_hash) then
    perform pg_sleep(1);
    raise exception 'Current password is wrong';
  end if;
  if length(coalesce(p_new, '')) < 8 then raise exception 'New password must be at least 8 characters'; end if;
  update public.app_users set password_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)) where id = u.id;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- 6. Expenses
-- ---------------------------------------------------------------------
create or replace function public.add_expense(p_token text, p_data json)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare u public.app_users; e public.expenses; v_id bigint;
begin
  u := public._auth(p_token);
  e := public._expense_from_json(p_data, true);
  insert into public.expenses (project_name, expense_date, category, label, paid_to, amount,
                               payment_mode, approved_by, notes, entered_by, created_by)
  values (e.project_name, e.expense_date, e.category, e.label, e.paid_to, e.amount,
          e.payment_mode, e.approved_by, e.notes, u.full_name, u.id)
  returning id into v_id;
  return v_id;
end $$;

-- admin/manager: all entries.  entry: only their own (always).
create or replace function public.get_expenses(
  p_token   text,
  p_project text    default null,
  p_from    date    default null,
  p_to      date    default null,
  p_mine    boolean default false,
  p_limit   int     default 5000
)
returns setof public.expenses
language plpgsql security definer set search_path = public
as $$
declare u public.app_users; v_mine boolean;
begin
  u := public._auth(p_token);
  v_mine := coalesce(p_mine, false) or u.role = 'entry';
  return query
    select * from public.expenses e
    where (coalesce(p_project, '') = '' or e.project_name = p_project)
      and (p_from is null or e.expense_date >= p_from)
      and (p_to   is null or e.expense_date <= p_to)
      and (not v_mine or e.created_by = u.id)
    order by (case when v_mine then e.created_at end) desc nulls last,
             e.expense_date desc, e.created_at desc
    limit least(coalesce(p_limit, 5000), case when u.role = 'entry' then 100 else 10000 end);
end $$;

create or replace function public.update_expense(p_token text, p_id bigint, p_data json)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare u public.app_users; e public.expenses;
begin
  u := public._auth(p_token, array['admin']);
  e := public._expense_from_json(p_data, false);
  update public.expenses set
    project_name = e.project_name, expense_date = e.expense_date, category = e.category, label = e.label,
    paid_to = e.paid_to, amount = e.amount, payment_mode = e.payment_mode, approved_by = e.approved_by,
    notes = e.notes, updated_at = now(), updated_by = u.full_name
  where id = p_id;
  if not found then raise exception 'Expense not found'; end if;
  return true;
end $$;

create or replace function public.delete_expense(p_token text, p_id bigint)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  perform public._auth(p_token, array['admin']);
  delete from public.expenses where id = p_id;
  return found;
end $$;

-- ---------------------------------------------------------------------
-- 7. Dropdown lists (projects, categories, sub-categories)
-- ---------------------------------------------------------------------
create or replace function public.get_options(p_token text)
returns json
language plpgsql security definer set search_path = public
as $$
declare u public.app_users; v_all boolean;
begin
  u := public._auth(p_token);
  v_all := u.role = 'admin';   -- admin also sees hidden items
  return json_build_object(
    'projects', coalesce((
      select json_agg(json_build_object('id', p.id, 'name', p.name, 'active', p.active) order by lower(p.name))
      from public.projects p where p.active or v_all), '[]'::json),
    'categories', coalesce((
      select json_agg(json_build_object(
               'id', c.id, 'name', c.name, 'active', c.active, 'sort', c.sort,
               'subs', coalesce((
                 select json_agg(json_build_object('id', s.id, 'name', s.name, 'active', s.active) order by lower(s.name))
                 from public.subcategories s
                 where s.category_id = c.id and (s.active or v_all)), '[]'::json))
             order by c.sort, lower(c.name))
      from public.categories c where c.active or v_all), '[]'::json)
  );
end $$;

create or replace function public.save_project(p_token text, p_id bigint, p_name text, p_active boolean default true)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_old text; v_id bigint; v_name text := trim(coalesce(p_name, ''));
begin
  perform public._auth(p_token, array['admin']);
  if v_name = '' then raise exception 'Please enter a project name'; end if;
  begin
    if p_id is null then
      insert into public.projects (name, active) values (v_name, coalesce(p_active, true)) returning id into v_id;
    else
      select name into v_old from public.projects where id = p_id;
      if v_old is null then raise exception 'Project not found'; end if;
      update public.projects set name = v_name, active = coalesce(p_active, true) where id = p_id;
      if v_old <> v_name then
        update public.expenses set project_name = v_name where project_name = v_old;
      end if;
      v_id := p_id;
    end if;
  exception when unique_violation then
    raise exception 'A project with this name already exists';
  end;
  return v_id;
end $$;

create or replace function public.delete_project(p_token text, p_id bigint)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_name text;
begin
  perform public._auth(p_token, array['admin']);
  select name into v_name from public.projects where id = p_id;
  if exists (select 1 from public.expenses where project_name = v_name) then
    raise exception 'This project has expenses, so it can''t be deleted. Use Hide instead.';
  end if;
  delete from public.projects where id = p_id;
  return found;
end $$;

create or replace function public.save_category(p_token text, p_id bigint, p_name text, p_active boolean default true)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_old text; v_id bigint; v_name text := trim(coalesce(p_name, ''));
begin
  perform public._auth(p_token, array['admin']);
  if v_name = '' then raise exception 'Please enter a category name'; end if;
  begin
    if p_id is null then
      insert into public.categories (name, active, sort)
      values (v_name, coalesce(p_active, true), (select coalesce(max(sort), 0) + 10 from public.categories))
      returning id into v_id;
    else
      select name into v_old from public.categories where id = p_id;
      if v_old is null then raise exception 'Category not found'; end if;
      update public.categories set name = v_name, active = coalesce(p_active, true) where id = p_id;
      if v_old <> v_name then
        update public.expenses set category = v_name where category = v_old;
      end if;
      v_id := p_id;
    end if;
  exception when unique_violation then
    raise exception 'A category with this name already exists';
  end;
  return v_id;
end $$;

create or replace function public.delete_category(p_token text, p_id bigint)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_name text;
begin
  perform public._auth(p_token, array['admin']);
  select name into v_name from public.categories where id = p_id;
  if exists (select 1 from public.expenses where category = v_name) then
    raise exception 'This category is used in expenses, so it can''t be deleted. Use Hide instead.';
  end if;
  delete from public.categories where id = p_id;
  return found;
end $$;

create or replace function public.save_subcategory(p_token text, p_id bigint, p_category_id bigint, p_name text, p_active boolean default true)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_old text; v_cat text; v_id bigint; v_name text := trim(coalesce(p_name, ''));
begin
  perform public._auth(p_token, array['admin']);
  if v_name = '' then raise exception 'Please enter a sub-category name'; end if;
  begin
    if p_id is null then
      if not exists (select 1 from public.categories where id = p_category_id) then
        raise exception 'Category not found';
      end if;
      insert into public.subcategories (category_id, name, active)
      values (p_category_id, v_name, coalesce(p_active, true)) returning id into v_id;
    else
      select s.name, c.name into v_old, v_cat
      from public.subcategories s join public.categories c on c.id = s.category_id where s.id = p_id;
      if v_old is null then raise exception 'Sub-category not found'; end if;
      update public.subcategories set name = v_name, active = coalesce(p_active, true) where id = p_id;
      if v_old <> v_name then
        update public.expenses set label = v_name where label = v_old and category = v_cat;
      end if;
      v_id := p_id;
    end if;
  exception when unique_violation then
    raise exception 'This sub-category already exists in this category';
  end;
  return v_id;
end $$;

create or replace function public.delete_subcategory(p_token text, p_id bigint)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_name text; v_cat text;
begin
  perform public._auth(p_token, array['admin']);
  select s.name, c.name into v_name, v_cat
  from public.subcategories s join public.categories c on c.id = s.category_id where s.id = p_id;
  if exists (select 1 from public.expenses where label = v_name and category = v_cat) then
    raise exception 'This sub-category is used in expenses, so it can''t be deleted. Use Hide instead.';
  end if;
  delete from public.subcategories where id = p_id;
  return found;
end $$;

-- ---------------------------------------------------------------------
-- 8. Users (admin only)
-- ---------------------------------------------------------------------
create or replace function public.list_users(p_token text)
returns json
language plpgsql security definer set search_path = public
as $$
begin
  perform public._auth(p_token, array['admin']);
  return coalesce((
    select json_agg(json_build_object('id', id, 'username', username, 'full_name', full_name,
                                      'role', role, 'active', active, 'created_at', created_at)
                    order by active desc, lower(full_name))
    from public.app_users), '[]'::json);
end $$;

-- p_id null = create a new user (password required); otherwise update.
-- Leave p_password empty to keep the current password.
create or replace function public.save_user(
  p_token text, p_id bigint, p_username text, p_full_name text, p_role text, p_active boolean, p_password text
)
returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
declare v_me public.app_users; v_id bigint;
begin
  v_me := public._auth(p_token, array['admin']);
  if p_role not in ('admin', 'manager', 'entry') then raise exception 'Please choose a user type'; end if;
  if nullif(trim(p_full_name), '') is null then raise exception 'Please enter the person''s name'; end if;
  if coalesce(p_password, '') <> '' and length(p_password) < 8 then
    raise exception 'Password must be at least 8 characters';
  end if;

  if p_id is null then
    if lower(trim(coalesce(p_username, ''))) !~ '^[a-z0-9._-]{3,30}$' then
      raise exception 'Username must be 3-30 letters or numbers, no spaces';
    end if;
    if coalesce(p_password, '') = '' then raise exception 'Please set a password for the new user'; end if;
    begin
      insert into public.app_users (username, full_name, role, password_hash)
      values (lower(trim(p_username)), trim(p_full_name), p_role,
              extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
      returning id into v_id;
    exception when unique_violation then
      raise exception 'That username is already taken';
    end;
    return v_id;
  end if;

  if p_id = v_me.id and (p_role <> 'admin' or not coalesce(p_active, true)) then
    raise exception 'You cannot remove your own Admin access';
  end if;

  update public.app_users set
    full_name = trim(p_full_name),
    role = p_role,
    active = coalesce(p_active, true),
    password_hash = case when coalesce(p_password, '') <> ''
                         then extensions.crypt(p_password, extensions.gen_salt('bf', 10))
                         else password_hash end
  where id = p_id;
  if not found then raise exception 'User not found'; end if;

  -- Log the user out everywhere if they were disabled or their password was reset
  if p_id <> v_me.id and (not coalesce(p_active, true) or coalesce(p_password, '') <> '') then
    delete from public.sessions where user_id = p_id;
  end if;
  return p_id;
end $$;

-- ---------------------------------------------------------------------
-- 9. Permissions: only these functions can be called from the website
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.setup_needed(),
  public.setup_admin(text, text, text),
  public.login(text, text),
  public.logout(text),
  public.me(text),
  public.change_my_password(text, text, text),
  public.add_expense(text, json),
  public.get_expenses(text, text, date, date, boolean, int),
  public.update_expense(text, bigint, json),
  public.delete_expense(text, bigint),
  public.get_options(text),
  public.save_project(text, bigint, text, boolean),
  public.delete_project(text, bigint),
  public.save_category(text, bigint, text, boolean),
  public.delete_category(text, bigint),
  public.save_subcategory(text, bigint, bigint, text, boolean),
  public.delete_subcategory(text, bigint),
  public.list_users(text),
  public.save_user(text, bigint, text, text, text, boolean, text)
to anon, authenticated;

-- Done! You should see "Success. No rows returned".

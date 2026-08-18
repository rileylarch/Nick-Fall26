-- Run this entire file in Supabase SQL Editor after creating your owner account.
-- Replace YOUR_OWNER_EMAIL before running.

create extension if not exists pgcrypto;

create table if not exists public.assignments (
  id text primary key,
  course_id text not null,
  name text not null,
  category text not null,
  due_date date,
  weight numeric not null default 0,
  status text not null default 'todo' check (status in ('todo', 'progress', 'done')),
  earned numeric,
  possible numeric not null default 100,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_logs (
  id text primary key,
  course_id text not null,
  log_date date not null,
  hours numeric not null check (hours > 0),
  kind text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

insert into public.app_admins (user_id)
select id from auth.users where email = 'YOUR_OWNER_EMAIL'
on conflict (user_id) do nothing;

alter table public.assignments enable row level security;
alter table public.time_logs enable row level security;
alter table public.app_admins enable row level security;

drop policy if exists "Anyone can view assignments" on public.assignments;
drop policy if exists "Anyone can view time logs" on public.time_logs;
drop policy if exists "Only owner can insert assignments" on public.assignments;
drop policy if exists "Only owner can update assignments" on public.assignments;
drop policy if exists "Only owner can delete assignments" on public.assignments;
drop policy if exists "Only owner can insert time logs" on public.time_logs;
drop policy if exists "Only owner can update time logs" on public.time_logs;
drop policy if exists "Only owner can delete time logs" on public.time_logs;
drop policy if exists "Users can check their own admin status" on public.app_admins;

create policy "Anyone can view assignments" on public.assignments
for select to anon, authenticated using (true);
create policy "Anyone can view time logs" on public.time_logs
for select to anon, authenticated using (true);

create policy "Only owner can insert assignments" on public.assignments
for insert to authenticated with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Only owner can update assignments" on public.assignments
for update to authenticated using (exists (select 1 from public.app_admins where user_id = auth.uid()))
with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Only owner can delete assignments" on public.assignments
for delete to authenticated using (exists (select 1 from public.app_admins where user_id = auth.uid()));

create policy "Only owner can insert time logs" on public.time_logs
for insert to authenticated with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Only owner can update time logs" on public.time_logs
for update to authenticated using (exists (select 1 from public.app_admins where user_id = auth.uid()))
with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Only owner can delete time logs" on public.time_logs
for delete to authenticated using (exists (select 1 from public.app_admins where user_id = auth.uid()));

create policy "Users can check their own admin status" on public.app_admins
for select to authenticated using (user_id = auth.uid());

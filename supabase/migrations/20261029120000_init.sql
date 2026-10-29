-- Πίνακες Σύστασης Ιδιοκτησίας — αρχικό σχήμα
-- Κάθε έργο αποθηκεύεται ως ένα έγγραφο jsonb (data), ώστε η εφαρμογή να εξελίσσεται
-- χωρίς migrations για κάθε νέο πεδίο. Τα βασικά στοιχεία (όνομα, ενημέρωση) είναι
-- και σε στήλες για λίστες/αναζήτηση. Κάθε χρήστης βλέπει μόνο τα δικά του.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- projects
create table public.projects (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name           text not null default '',
  data           jsonb not null,
  schema_version integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);

-- ---------------------------------------------------------------- history
-- Αυτόματο στιγμιότυπο της προηγούμενης μορφής κάθε έργου (το πολύ ένα ανά 10 λεπτά
-- επεξεργασίας, συν πάντα πριν από διαγραφή), για επαναφορά.
create table public.project_versions (
  id          bigint generated always as identity primary key,
  project_id  uuid not null references public.projects(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null default '',
  data        jsonb not null,
  reason      text not null default 'edit',
  saved_at    timestamptz not null default now()
);
create index project_versions_project_idx on public.project_versions (project_id, saved_at desc);

-- ---------------------------------------------------------------- settings
create table public.settings (
  owner_id   uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  eng        jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- triggers
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- owner_id δεν αλλάζει ποτέ μετά τη δημιουργία
create or replace function public.keep_owner()
returns trigger language plpgsql as $$
begin
  new.owner_id := old.owner_id;
  return new;
end $$;
create trigger projects_keep_owner before update on public.projects
  for each row execute function public.keep_owner();

create or replace function public.snapshot_project()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  last_at timestamptz;
  why text;
begin
  if new.deleted_at is not null and old.deleted_at is null then
    why := 'delete';
  elsif new.data is distinct from old.data then
    select max(saved_at) into last_at from public.project_versions where project_id = old.id;
    if last_at is not null and last_at > now() - interval '10 minutes' then
      return new;
    end if;
    why := 'edit';
  else
    return new;
  end if;
  insert into public.project_versions (project_id, owner_id, name, data, reason)
  values (old.id, old.owner_id, old.name, old.data, why);
  -- κρατάμε τα 200 πιο πρόσφατα στιγμιότυπα ανά έργο
  delete from public.project_versions
   where project_id = old.id
     and id not in (select id from public.project_versions where project_id = old.id order by saved_at desc limit 200);
  return new;
end $$;
revoke all on function public.snapshot_project() from public, anon, authenticated;

create trigger projects_snapshot after update on public.projects
  for each row execute function public.snapshot_project();

-- ---------------------------------------------------------------- RLS
alter table public.projects         enable row level security;
alter table public.project_versions enable row level security;
alter table public.settings         enable row level security;

create policy "projects: own rows" on public.projects
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "versions: read own" on public.project_versions
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "settings: own row" on public.settings
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Οι anon χρήστες δεν βλέπουν τίποτα (δεν υπάρχει policy για anon).

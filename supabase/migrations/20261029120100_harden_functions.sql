-- Συστάσεις Supabase advisor: σταθερό search_path και index στο owner_id του ιστορικού.
alter function public.touch_updated_at() set search_path = '';
alter function public.keep_owner() set search_path = '';
create index project_versions_owner_idx on public.project_versions (owner_id);

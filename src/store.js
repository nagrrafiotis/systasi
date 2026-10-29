// Πρόσβαση στη βάση (Supabase). Κάθε κλήση πετάει Error με .kind:
//   'auth'    — έληξε η σύνδεση, χρειάζεται νέο login
//   'network' — δεν υπάρχει σύνδεση / δεν απάντησε ο server (το έργο μένει τοπικά και ξαναδοκιμάζεται)
//   'server'  — άλλο σφάλμα της βάσης
import { supabase } from './supabase.js';

function fail(error) {
  const e = new Error(error?.message || 'Σφάλμα βάσης');
  const status = error?.status ?? error?.code;
  if (status === 401 || status === 403 || status === 'PGRST301' || /JWT|jwt|not authenticated/i.test(e.message)) e.kind = 'auth';
  else if (!status || /fetch|network|Failed to fetch|NetworkError|timeout/i.test(e.message)) e.kind = 'network';
  else e.kind = 'server';
  e.cause = error;
  return e;
}
async function run(q) {
  let res;
  try { res = await q; } catch (err) { throw fail(err); }
  if (res.error) throw fail(res.error);
  return res.data;
}

/* ------------------------------------------------------------ auth */
export const auth = {
  async session() { const { data } = await supabase.auth.getSession(); return data.session; },
  onChange(fn) { return supabase.auth.onAuthStateChange((event, session) => fn(event, session)); },
  async signIn(email, password) { return run(supabase.auth.signInWithPassword({ email, password })); },
  async signUp(email, password) { return run(supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } })); },
  async resetPassword(email) { return run(supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin })); },
  async updatePassword(password) { return run(supabase.auth.updateUser({ password })); },
  async signOut() { await supabase.auth.signOut(); },
};

/* ------------------------------------------------------------ projects */
const COLS = 'id,name,data,updated_at';

export async function listProjects() {
  return run(supabase.from('projects').select(COLS).is('deleted_at', null).order('updated_at', { ascending: false }));
}

/** Αποθήκευση ολόκληρου του έργου. Επιστρέφει { id, updated_at }. */
export async function saveProject(p) {
  const row = { id: p.id, name: String(p.info?.name || '').slice(0, 300), data: p, deleted_at: null };
  return run(supabase.from('projects').upsert(row, { onConflict: 'id' }).select('id,updated_at').single());
}

export async function deleteProject(id) {
  return run(supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id'));
}

export async function listDeleted() {
  return run(supabase.from('projects').select('id,name,updated_at,deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(100));
}

export async function restoreDeleted(id) {
  return run(supabase.from('projects').update({ deleted_at: null }).eq('id', id).select(COLS).single());
}

/* ------------------------------------------------------------ history */
export async function listVersions(projectId) {
  return run(supabase.from('project_versions').select('id,name,reason,saved_at').eq('project_id', projectId).order('saved_at', { ascending: false }).limit(200));
}

export async function getVersion(id) {
  return run(supabase.from('project_versions').select('id,name,data,saved_at').eq('id', id).single());
}

/* ------------------------------------------------------------ settings */
export async function loadSettings() {
  const rows = await run(supabase.from('settings').select('eng').limit(1));
  return rows[0] || null;
}

export async function saveSettings(eng) {
  return run(supabase.from('settings').upsert({ eng }, { onConflict: 'owner_id' }).select('owner_id'));
}

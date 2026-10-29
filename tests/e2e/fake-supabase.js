// Προσομοίωση Supabase για δοκιμές διεπαφής (μόνο ό,τι χρησιμοποιεί το src/store.js).
const LS = k => JSON.parse(localStorage.getItem('fake.' + k) || 'null');
const SAVE = (k, v) => localStorage.setItem('fake.' + k, JSON.stringify(v));
const db = () => LS('db') || { projects: [], project_versions: [], settings: [], users: [], seq: 1 };
const offline = () => localStorage.getItem('fake.offline') === '1';
let clock = Date.now();
const now = () => new Date(++clock).toISOString();
const listeners = [];
const session = () => LS('session');
const emit = (ev, s) => listeners.forEach(fn => fn(ev, s));
const netErr = { data: null, error: { message: 'TypeError: Failed to fetch', status: 0 } };
const delay = () => new Promise(r => setTimeout(r, 30));

class Q {
  constructor(t) { this.t = t; this.f = []; this.op = 'select'; this.ord = null; this.lim = null; this.one = false; }
  select() { return this; }
  is(k, v) { this.f.push(r => (r[k] ?? null) === v); return this; }
  not(k, op, v) { this.f.push(r => (r[k] ?? null) !== v); return this; }
  eq(k, v) { this.f.push(r => String(r[k]) === String(v)); return this; }
  order(k, o) { this.ord = [k, o && o.ascending === false ? -1 : 1]; return this; }
  limit(n) { this.lim = n; return this; }
  single() { this.one = true; return this; }
  upsert(row, o) { this.op = 'upsert'; this.row = row; this.key = (o && o.onConflict) || 'id'; return this; }
  update(p) { this.op = 'update'; this.patch = p; return this; }
  then(res, rej) { return this.exec().then(res, rej); }
  async exec() {
    await delay();
    if (offline()) return netErr;
    const s = session(); if (!s) return { data: null, error: { message: 'JWT expired', status: 401 } };
    const uid = s.user.id, D = db(), T = D[this.t];
    const mine = r => r.owner_id === uid;
    const snap = (old, why) => { const last = D.project_versions.filter(v => v.project_id === old.id).map(v => v.saved_at).sort().pop();
      const win = Number(localStorage.getItem('fake.snapMs') ?? 600000);
      if (why === 'edit' && last && Date.parse(last) > clock - win) return;
      D.project_versions.push({ id: D.seq++, project_id: old.id, owner_id: old.owner_id, name: old.name, data: old.data, reason: why, saved_at: now() }); };
    let out;
    if (this.op === 'select') {
      out = T.filter(mine).filter(r => this.f.every(f => f(r)));
      if (this.ord) out.sort((a, b) => (a[this.ord[0]] > b[this.ord[0]] ? 1 : -1) * this.ord[1]);
      if (this.lim) out = out.slice(0, this.lim);
    } else if (this.op === 'upsert') {
      const k = this.key, val = k === 'owner_id' ? uid : this.row[k];
      let r = T.find(x => x[k] === val);
      if (r && !mine(r)) return { data: null, error: { message: 'new row violates row-level security policy', status: 403, code: '42501' } };
      if (r) { const old = { ...r }; Object.assign(r, this.row, { updated_at: now() });
        if (this.t === 'projects') { if (r.deleted_at && !old.deleted_at) snap(old, 'delete'); else if (JSON.stringify(old.data) !== JSON.stringify(r.data)) snap(old, 'edit'); } }
      else { r = { ...this.row, owner_id: uid, created_at: now(), updated_at: now() }; T.push(r); }
      out = [r];
    } else if (this.op === 'update') {
      out = T.filter(mine).filter(r => this.f.every(f => f(r)));
      out.forEach(r => { const old = { ...r }; Object.assign(r, this.patch, { updated_at: now() });
        if (this.t === 'projects') { if (r.deleted_at && !old.deleted_at) snap(old, 'delete'); else if (JSON.stringify(old.data) !== JSON.stringify(r.data)) snap(old, 'edit'); } });
    }
    SAVE('db', D);
    out = JSON.parse(JSON.stringify(out));
    if (this.one) return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', status: 406, code: 'PGRST116' } };
    return { data: out, error: null };
  }
}

export const configured = true;
export const supabase = {
  from: t => new Q(t),
  auth: {
    async getSession() { return { data: { session: session() } }; },
    onAuthStateChange(fn) { listeners.push(fn); setTimeout(() => fn('INITIAL_SESSION', session()), 0); return { data: { subscription: { unsubscribe() {} } } }; },
    async signInWithPassword({ email, password }) { await delay(); if (offline()) return netErr;
      const u = db().users.find(x => x.email === email && x.password === password);
      if (!u) return { data: null, error: { message: 'Invalid login credentials', status: 400 } };
      const s = { user: { id: u.id, email } }; SAVE('session', s); emit('SIGNED_IN', s); return { data: { session: s, user: s.user }, error: null }; },
    async signUp({ email, password }) { await delay(); const D = db(); if (D.users.some(x => x.email === email)) return { data: null, error: { message: 'User already registered', status: 422 } };
      const u = { id: crypto.randomUUID(), email, password }; D.users.push(u); SAVE('db', D);
      const s = { user: { id: u.id, email } }; SAVE('session', s); emit('SIGNED_IN', s); return { data: { session: s, user: s.user }, error: null }; },
    async resetPasswordForEmail() { await delay(); return { data: {}, error: null }; },
    async updateUser() { await delay(); return { data: {}, error: null }; },
    async signOut() { localStorage.removeItem('fake.session'); emit('SIGNED_OUT', null); return { error: null }; },
  },
};

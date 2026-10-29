// Πίνακες Σύστασης Ιδιοκτησίας — διεπαφή
import './style.css';
import './doc.css';
import { AREA_COLS, KINDS, UNIT_TYPES, LEVELS, ZONES, REGIMES, PLOT_TYPES, AREAS_ZONE, TABS, DEFAULT_ENG, $, $$, uid, newPid, esc, clone, num, nz, r2, fmt, a2, fin, UP,
  parseRings, normPt, blankProject, GU, mkUnit, sampleProject, compute } from './core.js';
import { configured } from './supabase.js';
import * as store from './store.js';

const S={p:null,c:null,projects:new Map(),meta:{},settings:{eng:clone(DEFAULT_ENG)},user:null,dirty:false,saving:false,open:new Set(),loaded:false,delArm:false,dl:null,authMode:'in'};

/* ---------- storage (Supabase + τοπικό αντίγραφο ασφαλείας) ---------- */
// Κάθε αλλαγή γράφεται ΠΡΩΤΑ στη συσκευή (localStorage) και μετά στη βάση.
// Αν η βάση δεν απαντήσει, το έργο μένει «σε αναμονή» και ξαναστέλνεται αυτόματα.
const LS_KEY = 'systasi';
const cacheKey = () => LS_KEY + '.cache.' + (S.user ? S.user.id : 'anon');
function cacheRead() { try { return JSON.parse(localStorage.getItem(cacheKey()) || 'null') || { projects: {}, pending: {}, settings: null }; } catch (e) { return { projects: {}, pending: {}, settings: null }; } }
function cacheWrite(c) { try { localStorage.setItem(cacheKey(), JSON.stringify(c)); return true; } catch (e) { return false; } }
function cachePut(p, pending) { const c = cacheRead(); c.projects[p.id] = p; if (pending) c.pending[p.id] = Date.now(); else delete c.pending[p.id]; cacheWrite(c); }
function cacheDrop(id) { const c = cacheRead(); delete c.projects[id]; delete c.pending[id]; cacheWrite(c); }
const pendingIds = () => Object.keys(cacheRead().pending || {});

let saveT = null, setT = null, retryT = null;
function scheduleSave() { if (!S.p) return; S.dirty = true; setStatus('busy', 'Αποθήκευση…'); clearTimeout(saveT); saveT = setTimeout(saveNow, 700); }

async function saveNow() {
  if (!S.p || !S.user) return;
  clearTimeout(saveT);
  const p = S.p; p.updatedAt = Date.now();
  if (p.sample) { delete p.sample; renderBanner(); }
  const body = clone(p); S.projects.set(p.id, body); fillProjSel();
  cachePut(body, true);
  if (S.saving) { saveT = setTimeout(saveNow, 400); return; }
  S.saving = true;
  try {
    const row = await store.saveProject(body);
    S.meta[p.id] = row.updated_at;
    // ο χρήστης μπορεί να άλλαξε κάτι όσο έφευγε το αίτημα
    const cur = S.projects.get(p.id);
    if (cur && cur.updatedAt === body.updatedAt) { cachePut(body, false); S.dirty = false; setStatus('ok', 'Αποθηκεύτηκε'); }
  } catch (e) { onSaveError(e); }
  finally { S.saving = false; }
}

function onSaveError(e) {
  if (e.kind === 'auth') { setStatus('local', 'Φυλάχτηκε στη συσκευή — συνδέσου ξανά'); showAuth('Η σύνδεση έληξε. Συνδέσου ξανά· οι αλλαγές σου έχουν φυλαχτεί σε αυτή τη συσκευή.'); return; }
  setStatus('local', e.kind === 'network' ? 'Χωρίς σύνδεση — φυλάχτηκε στη συσκευή' : 'Δεν αποθηκεύτηκε στη βάση — φυλάχτηκε στη συσκευή');
  if (e.kind === 'server') toast('Η βάση απέρριψε την αποθήκευση: ' + e.message);
  scheduleRetry();
}
function scheduleRetry(ms = 15000) { clearTimeout(retryT); retryT = setTimeout(flushPending, ms); }

async function flushPending() {
  if (!S.user) return;
  const ids = pendingIds(); if (!ids.length) return;
  const c = cacheRead(); let failed = false;
  for (const id of ids) {
    const p = c.projects[id]; if (!p) { cacheDrop(id); continue; }
    try { const row = await store.saveProject(p); S.meta[id] = row.updated_at; cachePut(p, false); }
    catch (e) { failed = true; if (e.kind === 'auth') { showAuth('Η σύνδεση έληξε. Συνδέσου ξανά για να αποθηκευτούν οι εκκρεμείς αλλαγές.'); return; } break; }
  }
  if (failed) { setStatus('local', 'Εκκρεμούν αλλαγές — θα σταλούν αυτόματα'); scheduleRetry(30000); }
  else if (!S.dirty) setStatus('ok', 'Όλα αποθηκευμένα');
}

function saveSettings() {
  clearTimeout(setT);
  const c = cacheRead(); c.settings = clone(S.settings); cacheWrite(c);
  setT = setTimeout(async () => { try { await store.saveSettings(S.settings.eng || {}); } catch (e) { /* μένει στη συσκευή, ξαναστέλνεται στην επόμενη αλλαγή */ } }, 700);
}
function setStatus(cls, txt) { const el = $('#status'); el.className = 'status ' + cls; el.lastElementChild.textContent = txt; }

/** Φόρτωση μετά το login: πρώτα το τοπικό αντίγραφο (άμεσα), μετά η βάση. */
async function loadAll() {
  const c = cacheRead();
  S.projects = new Map(Object.entries(c.projects || {}));
  if (c.settings) S.settings = Object.assign({ eng: clone(DEFAULT_ENG) }, c.settings);
  afterLoad();
  setStatus('busy', 'Συγχρονισμός…');
  try {
    const [rows, st] = await Promise.all([store.listProjects(), store.loadSettings()]);
    const pend = cacheRead().pending || {};
    const next = new Map();
    rows.forEach(r => { S.meta[r.id] = r.updated_at; const d = r.data || {}; d.id = r.id; next.set(r.id, pend[r.id] ? c.projects[r.id] || d : d); });
    Object.keys(pend).forEach(id => { if (!next.has(id) && c.projects[id]) next.set(id, c.projects[id]); });
    S.projects = next;
    const nc = cacheRead(); nc.projects = Object.fromEntries([...next].map(([k, v]) => [k, v])); cacheWrite(nc);
    if (st && st.eng && Object.keys(st.eng).length) { S.settings.eng = Object.assign(clone(DEFAULT_ENG), st.eng); }
    else if (c.settings && c.settings.eng) saveSettings();
    if (S.p && !S.p.sample && next.has(S.p.id) && !S.dirty && !pend[S.p.id]) S.p = clone(next.get(S.p.id));
    S.loaded = true; afterLoad(true);
    setStatus('ok', Object.keys(pend).length ? 'Αποστολή εκκρεμών…' : 'Συγχρονίστηκε');
    flushPending();
  } catch (e) {
    S.loaded = true;
    if (e.kind === 'auth') { showAuth('Η σύνδεση έληξε. Συνδέσου ξανά.'); return; }
    setStatus('local', 'Χωρίς σύνδεση — εμφανίζεται το αντίγραφο της συσκευής'); scheduleRetry();
  }
}
function afterLoad(force) {
  if (S.p && !S.p.sample && !force) { renderAll(); return; }
  const list = [...S.projects.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  let last = null; try { last = localStorage.getItem(LS_KEY + '.last'); } catch (e) {}
  const pick = (S.p && !S.p.sample && S.projects.get(S.p.id)) || list.find(p => p.id === last) || list[0];
  if (pick) S.p = clone(pick); else if (!S.p) S.p = sampleProject();
  renderAll();
}
/** Όταν επιστρέφεις στην καρτέλα: φέρνει αλλαγές που έγιναν από άλλη συσκευή. */
async function pullChanges() {
  if (!S.user || !S.loaded || S.dirty || S.saving || document.hidden) return;
  try {
    const rows = await store.listProjects(); const pend = cacheRead().pending || {};
    let changed = false; const seen = new Set();
    rows.forEach(r => { seen.add(r.id); if (pend[r.id]) return; if (S.meta[r.id] !== r.updated_at) { const d = r.data || {}; d.id = r.id; S.projects.set(r.id, d); S.meta[r.id] = r.updated_at; cachePut(d, false); changed = true;
      if (S.p && S.p.id === r.id && !S.dirty) S.p = clone(d); } });
    [...S.projects.keys()].forEach(id => { if (!seen.has(id) && !pend[id]) { S.projects.delete(id); cacheDrop(id); changed = true; } });
    if (changed) { if (S.p && !S.p.sample && !S.projects.has(S.p.id)) afterLoad(true); else { const y = window.scrollY; renderAll(); window.scrollTo(0, y); } }
  } catch (e) { /* ήσυχα — θα ξαναδοκιμάσει */ }
}
window.addEventListener('online', () => { flushPending(); pullChanges(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { flushPending(); pullChanges(); } });
window.addEventListener('beforeunload', ev => { if (S.dirty || pendingIds().length) { saveNow(); ev.preventDefault(); ev.returnValue = ''; } });

/* ---------- σύνδεση χρήστη ---------- */
function showAuth(msg, mode = 'in') {
  const box = $('#auth'); box.hidden = false; document.body.classList.add('locked');
  $('#authMsg').textContent = msg || ''; $('#authMsg').hidden = !msg;
  setAuthMode(mode);
  setTimeout(() => { const el = mode === 'newpass' ? $('#authPass') : $('#authEmail'); el && el.focus(); }, 30);
}
function hideAuth() { $('#auth').hidden = true; document.body.classList.remove('locked'); }
function setAuthMode(m) {
  S.authMode = m;
  const t = { in: ['Σύνδεση', 'Σύνδεση'], up: ['Νέος λογαριασμός', 'Δημιουργία λογαριασμού'], reset: ['Επαναφορά κωδικού', 'Αποστολή συνδέσμου'], newpass: ['Νέος κωδικός', 'Αποθήκευση κωδικού'] }[m];
  $('#authTitle').textContent = t[0]; $('#authSubmit').textContent = t[1];
  $('#authEmailRow').hidden = m === 'newpass'; $('#authPassRow').hidden = m === 'reset';
  $('#authPass').autocomplete = m === 'in' ? 'current-password' : 'new-password';
  $('#authLinks').innerHTML = m === 'in'
    ? '<button type="button" class="linkbtn" data-auth="up">Δημιουργία λογαριασμού</button><button type="button" class="linkbtn" data-auth="reset">Ξέχασα τον κωδικό</button>'
    : m === 'newpass' ? '' : '<button type="button" class="linkbtn" data-auth="in">Πίσω στη σύνδεση</button>';
}
document.addEventListener('click', ev => { const b = ev.target.closest('[data-auth]'); if (b) { setAuthMode(b.dataset.auth); $('#authErr').hidden = true; } });
$('#authForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const email = $('#authEmail').value.trim(), pass = $('#authPass').value, m = S.authMode, err = $('#authErr'), btn = $('#authSubmit');
  err.hidden = true;
  if (m !== 'newpass' && !/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Γράψε ένα έγκυρο email.'; err.hidden = false; return; }
  if ((m === 'up' || m === 'newpass') && pass.length < 8) { err.textContent = 'Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες.'; err.hidden = false; return; }
  btn.disabled = true;
  try {
    if (m === 'in') await store.auth.signIn(email, pass);
    else if (m === 'up') { const d = await store.auth.signUp(email, pass); if (!d.session) { $('#authMsg').textContent = 'Σου στείλαμε email επιβεβαίωσης. Πάτα τον σύνδεσμο και μετά συνδέσου.'; $('#authMsg').hidden = false; setAuthMode('in'); } }
    else if (m === 'reset') { await store.auth.resetPassword(email); $('#authMsg').textContent = 'Αν υπάρχει λογαριασμός, θα λάβεις email με σύνδεσμο για νέο κωδικό.'; $('#authMsg').hidden = false; setAuthMode('in'); }
    else if (m === 'newpass') { await store.auth.updatePassword(pass); toast('Ο κωδικός άλλαξε'); hideAuth(); }
  } catch (e) {
    err.textContent = e.kind === 'network' ? 'Δεν υπάρχει σύνδεση με τον server. Δοκίμασε ξανά.' : /Invalid login/i.test(e.message) ? 'Λάθος email ή κωδικός.' : /already registered/i.test(e.message) ? 'Υπάρχει ήδη λογαριασμός με αυτό το email.' : /Email not confirmed/i.test(e.message) ? 'Δεν έχει επιβεβαιωθεί το email. Δες το email επιβεβαίωσης.' : e.message;
    err.hidden = false;
  } finally { btn.disabled = false; }
});

async function onSession(session, event) {
  const u = session ? session.user : null;
  if (event === 'PASSWORD_RECOVERY') { S.user = u; showAuth('Όρισε νέο κωδικό για τον λογαριασμό σου.', 'newpass'); return; }
  if (!u) { const was = S.user; S.user = null; if (was) { S.projects = new Map(); S.p = sampleProject(); renderAll(); } setStatus('', 'Εκτός σύνδεσης'); showAuth(); return; }
  const changed = !S.user || S.user.id !== u.id; S.user = u;
  $('#who').textContent = u.email || '';
  if (S.authMode !== 'newpass') hideAuth();
  if (changed) await loadAll(); else flushPending();
}
async function initStore() {
  if (!configured) { showConfigError(); return; }
  store.auth.onChange((event, session) => { if (event === 'INITIAL_SESSION') return; if (event === 'TOKEN_REFRESHED') { S.user = session ? session.user : S.user; return; } onSession(session, event); });
  const session = await store.auth.session().catch(() => null);
  await onSession(session, 'INITIAL_SESSION');
}
function showConfigError() {
  setStatus('', 'Δεν έχει ρυθμιστεί η βάση');
  $('#banner').innerHTML = '<div class="banner"><span><b>Λείπουν οι ρυθμίσεις Supabase.</b> Όρισε VITE_SUPABASE_URL και VITE_SUPABASE_PUBLISHABLE_KEY (τοπικά στο .env, στο Vercel στα Environment Variables) και ξαναχτίσε την εφαρμογή.</span></div>';
}

/* ---------- ιστορικό εκδόσεων & διαγραμμένα ---------- */
function openDialog(title, html) { const d = $('#dlg'); $('#dlgTitle').textContent = title; $('#dlgBody').innerHTML = html; if (!d.open) d.showModal(); return d; }
const dt = s => { try { return new Date(s).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return s; } };
async function showHistory() {
  const p = S.p;
  if (!S.projects.has(p.id)) { toast('Το έργο δεν έχει αποθηκευτεί ακόμη.'); return; }
  openDialog('Ιστορικό εκδόσεων', '<p class="hint">Φόρτωση…</p>');
  try {
    const v = await store.listVersions(p.id);
    $('#dlgBody').innerHTML = v.length
      ? `<p class="hint">Στιγμιότυπα της μορφής του έργου πριν από αλλαγές (το πολύ ένα ανά 10 λεπτά επεξεργασίας). Η επαναφορά κρατά την τωρινή μορφή στο ιστορικό.</p>
         <div class="tscroll"><table class="dt"><thead><tr><th>Ημερομηνία</th><th>Όνομα</th><th></th></tr></thead><tbody>${v.map(x => `<tr><td>${esc(dt(x.saved_at))}${x.reason === 'delete' ? ' <span class="badge warn">πριν τη διαγραφή</span>' : ''}</td><td>${esc(x.name)}</td><td class="act"><button class="btn sm" data-ver="${x.id}" data-mode="copy">Άνοιγμα ως αντίγραφο</button> <button class="btn sm primary" data-ver="${x.id}" data-mode="restore">Επαναφορά</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="hint">Δεν υπάρχουν ακόμη παλαιότερες εκδόσεις. Δημιουργούνται αυτόματα καθώς αλλάζεις το έργο.</p>';
  } catch (e) { $('#dlgBody').innerHTML = '<p class="hint">Δεν φορτώθηκε το ιστορικό. ' + esc(e.kind === 'network' ? 'Δεν υπάρχει σύνδεση.' : e.message) + '</p>'; }
}
async function showTrash() {
  openDialog('Διαγραμμένα έργα', '<p class="hint">Φόρτωση…</p>');
  try {
    const v = await store.listDeleted();
    $('#dlgBody').innerHTML = v.length
      ? `<div class="tscroll"><table class="dt"><thead><tr><th>Έργο</th><th>Διαγράφηκε</th><th></th></tr></thead><tbody>${v.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(dt(x.deleted_at))}</td><td class="act"><button class="btn sm primary" data-undel="${x.id}">Επαναφορά</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="hint">Δεν υπάρχουν διαγραμμένα έργα.</p>';
  } catch (e) { $('#dlgBody').innerHTML = '<p class="hint">Δεν φορτώθηκε η λίστα. ' + esc(e.message) + '</p>'; }
}
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-ver],[data-undel],[data-dlg-close]'); if (!b) return;
  const d = $('#dlg');
  if (b.dataset.dlgClose !== undefined) { d.close(); return; }
  b.disabled = true;
  try {
    if (b.dataset.undel) { const r = await store.restoreDeleted(b.dataset.undel); const p = r.data; p.id = r.id; S.meta[r.id] = r.updated_at; S.projects.set(r.id, p); cachePut(p, false); d.close(); S.p = clone(p); S.open.clear(); renderAll(); toast('Επαναφέρθηκε: ' + p.info.name); return; }
    const v = await store.getVersion(b.dataset.ver); const data = v.data;
    if (b.dataset.mode === 'copy') { const np = normProject(clone(data)); np.info.name = (data.info?.name || '') + ' (από ' + dt(v.saved_at) + ')'; d.close(); openProject(np, true); }
    else { data.id = S.p.id; S.p = clone(data); d.close(); S.open.clear(); renderAll(); await saveNow(); toast('Έγινε επαναφορά στην έκδοση ' + dt(v.saved_at)); }
  } catch (e) { toast('Δεν ολοκληρώθηκε: ' + (e.kind === 'network' ? 'δεν υπάρχει σύνδεση' : e.message)); b.disabled = false; }
});

/* ---------- rendering ---------- */
let TAB='units', TAB_OVERRIDE=null;
function curTab(){ if(TAB_OVERRIDE) return TAB_OVERRIDE; let h=''; try{ h=location.hash.replace('#',''); }catch(e){} return TABS.some(t=>t[0]===h)?h:'units'; }
function goTab(t){ TAB_OVERRIDE=t; try{ if(location.hash!=='#'+t) location.hash=t; }catch(e){} }
function renderAll(){ S.c=compute(S.p); try{ localStorage.setItem(LS_KEY+'.last',S.p.id); }catch(e){} fillProjSel(); renderBanner(); renderFigs(); renderTabs(); renderMain(); }
function refresh(){ S.c=compute(S.p); renderFigs(); renderTabs(); updateCalc(); }
function fillProjSel(){
  const sel=$('#projSel'); const list=[...S.projects.values()].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  let h=''; if(S.p&&!S.projects.has(S.p.id)) h+=`<option value="${esc(S.p.id)}" selected>${esc(S.p.info.name)}${S.p.sample?' (μη αποθηκευμένο)':''}</option>`;
  h+=list.map(p=>`<option value="${esc(p.id)}" ${S.p&&S.p.id===p.id?'selected':''}>${esc(p.info?.name||'Χωρίς όνομα')}</option>`).join('');
  sel.innerHTML=h||'<option>—</option>';
}
function renderBanner(){
  $('#banner').innerHTML = S.p&&S.p.sample ? `<div class="banner"><span><b>Παράδειγμα:</b> οι πίνακες που έστειλε η συμβολαιογράφος (7 κατοικίες), μεταφερμένοι εδώ. Δεν έχει αποθηκευτεί — με την πρώτη αλλαγή γίνεται δικό σου έργο.</span><span class="row"><button class="btn sm primary" data-act="new-blank">Ξεκίνα κενό έργο</button></span></div>`:'';
}
function renderFigs(){
  const p=S.p,c=S.c,G=PLOT_TYPES[p.info.plotType]||PLOT_TYPES.oik;
  const okPm=Math.abs(c.pmSum-1000)<1e-6;
  const ne=c.checks.filter(x=>x.sev==='err').length, nw=c.checks.filter(x=>x.sev==='warn').length;
  $('#figs').innerHTML=`
   <div class="fig"><span>Εμβαδόν ${esc(G[2])}</span><b class="num">${fmt(num(p.info.plotArea))}<small>m²</small></b></div>
   <div class="fig"><span>Ιδιοκτησίες</span><b class="num">${p.units.length}</b></div>
   <div class="fig ${okPm?'good':'bad'}"><span>Σύνολο χιλιοστών</span><b class="num" data-calc="pmSum">${fmt(c.pmSum,p.calc.dec)}<small>‰</small></b></div>
   <div class="fig"><span>Αποκλ. χρήσεις + στάθμευση</span><b class="num">${fmt(r2(c.tot.excl+c.tot.park))}<small>m²</small></b></div>
   <div class="fig"><span>Κοινόχρηστοι χώροι</span><b class="num">${fmt(c.commonAll)}<small>m²</small></b></div>
   <div class="fig ${ne?'bad':(nw?'':'good')}"><span>Έλεγχοι</span><b class="num">${ne?ne+(ne>1?' σφάλματα':' σφάλμα'):(nw?nw+' προειδ.':'Εντάξει')}</b></div>`;
}
function renderTabs(){
  const c=S.c; TAB=curTab();
  const ne=c.checks.filter(x=>x.sev==='err').length, nw=c.checks.filter(x=>x.sev==='warn').length;
  $('#tabs').innerHTML=TABS.map(([k,l])=>{ let b='';
    if(k==='checks') b=`<span class="badge ${ne?'err':nw?'warn':'ok'}">${ne||nw||'✓'}</span>`;
    if(k==='units') b=`<span class="badge">${S.p.units.length}</span>`;
    if(k==='excl') b=`<span class="badge">${S.p.excl.length}</span>`;
    return `<a href="#${k}" ${k===TAB?'aria-current="page"':''}>${l}${b}</a>`; }).join('');
}
let RENDERING=false;
function renderMain(){
  if(RENDERING) return; RENDERING=true;
  try{ const ae=document.activeElement; if(ae&&ae!==document.body&&$('#main').contains(ae)) ae.blur(); }catch(e){}
  try{ renderMainInner(); } finally{ RENDERING=false; }
}
function renderMainInner(){
  TAB=curTab(); const f={info:vInfo,units:vUnits,excl:vExcl,common:vCommon,coords:vCoords,checks:vChecks,tables:vTables}[TAB];
  $('#main').innerHTML=f(); updateCalc();
}
const I=(coll,id,field,val,cls='n',extra='')=>`<input type="text" class="${cls}" ${cls==='n'?'inputmode="decimal"':''} id="${coll}-${id}-${field}" data-coll="${coll}" data-id="${esc(id)}" data-field="${field}" value="${esc(cls==='n'?fin(val):val??'')}" ${extra}>`;
const SEL=(coll,id,field,opts,val,extra='')=>`<select id="${coll}-${id}-${field}" data-coll="${coll}" data-id="${esc(id)}" data-field="${field}" ${extra}>${opts.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(val)?'selected':''}>${esc(l)}</option>`).join('')}</select>`;

function vInfo(){
  const p=S.p,i=p.info,e=S.settings.eng||{};
  const F=(f,l,cls='',type='text')=>`<label class="f ${cls}"><span>${l}</span>${type==='area'?`<textarea rows="2" id="info-${f}" data-coll="info" data-field="${f}">${esc(i[f])}</textarea>`:`<input type="${type==='num'?'text':type}" ${type==='num'?'inputmode="decimal" class="num"':''} id="info-${f}" data-coll="info" data-field="${f}" data-num="${type==='num'?1:''}" value="${esc(type==='num'?fin(i[f]):i[f])}">`}</label>`;
  const FS=(f,l,opts)=>`<label class="f"><span>${l}</span><select id="info-${f}" data-coll="info" data-field="${f}" data-re="1">${Object.entries(opts).map(([k,v])=>`<option value="${k}" ${i[f]===k?'selected':''}>${esc(Array.isArray(v)?v[0]:v)}</option>`).join('')}</select></label>`;
  const E=(f,l,cls='')=>`<label class="f ${cls}"><span>${l}</span><input type="text" id="eng-${f}" data-coll="eng" data-field="${f}" value="${esc(e[f])}"></label>`;
  return `<section class="sect">
   <div class="sect-head"><div><h2>Στοιχεία έργου</h2><p>Όσα εμφανίζονται στην κεφαλίδα και την υπογραφή των πινάκων. Το εμβαδόν είναι αυτό του τοπογραφικού / Κτηματολογίου.</p></div></div>
   <div class="panel"><h3>Ακίνητο</h3><div class="grid">
     ${F('name','Ονομασία έργου','span2')}
     ${FS('regime','Είδος σύστασης',REGIMES)}
     ${FS('plotType','Ακίνητο',PLOT_TYPES)}
     ${F('plotArea','Εμβαδόν (m²)','','num')}
     ${FS('zone','Περιοχή',AREAS_ZONE)}
     ${F('coverage','Κάλυψη κτιρίων (m²) — για ισοζύγιο','','num')}
     ${F('kaek','ΚΑΕΚ')}
     ${F('ot','Ο.Τ. / Θέση')}
     ${F('location','Διεύθυνση / τοποθεσία','span2')}
     ${F('municipality','Δήμος / Δ.Ε.')}
     ${F('permit','Οικοδομική άδεια (αρ. / ημ/νία)')}
     ${F('owners','Ιδιοκτήτες / συμβαλλόμενοι','span2')}
     ${F('notary','Συμβολαιογράφος')}
     ${F('place','Τόπος υπογραφής')}
     ${F('date','Ημερομηνία','','date')}
     ${F('titleOverride','Τίτλος κύριου πίνακα (προαιρετικά)','span2')}
   </div></div>
   <div class="panel"><h3>Υπολογισμός χιλιοστών</h3>
     <div class="row" style="gap:18px;margin-bottom:12px">
       <label class="chk"><input type="radio" name="pmmode" value="auto" data-coll="calc" data-field="mode" ${p.calc.mode==='auto'?'checked':''}> Αυτόματα, αναλογικά με εμβαδά</label>
       <label class="chk"><input type="radio" name="pmmode" value="manual" data-coll="calc" data-field="mode" ${p.calc.mode==='manual'?'checked':''}> Χειροκίνητα ανά ιδιοκτησία</label>
       <label class="chk">Δεκαδικά ‰ ${SEL('calc','x','dec',[[0,'0'],[1,'1'],[2,'2'],[3,'3']],p.calc.dec)}</label>
     </div>
     <p class="hint" style="margin-bottom:10px">Βάρος ιδιοκτησίας = συντελεστής θέσης × Σ(εμβαδόν × συντελεστής στήλης). Τα χιλιοστά στρογγυλεύονται ώστε το σύνολο να βγαίνει ακριβώς 1000‰. Στο παράδειγμα της συμβολαιογράφου τα ποσοστά προκύπτουν μόνο από τους κύριους χώρους (συντελεστής 1, οι υπόλοιποι 0).</p>
     <div class="tscroll"><table class="dt"><thead><tr><th>Στήλη</th><th class="n">Συντελεστής</th><th>Εμφάνιση στον πίνακα</th></tr></thead><tbody>
       ${AREA_COLS.map(a=>`<tr><td>${a.h}</td><td class="n">${I('coef','x',a.k,p.calc.coef[a.k])}</td><td><label class="chk"><input type="checkbox" data-coll="cols" data-field="${a.k}" ${p.calc.cols[a.k]!==false?'checked':''}> εμφανίζεται</label></td></tr>`).join('')}
       <tr><td>Αποκλειστικές χρήσεις ${esc((PLOT_TYPES[i.plotType]||PLOT_TYPES.oik)[2])}</td><td class="n">${I('coef','x','excl',p.calc.coef.excl)}</td><td class="hint">πάντα</td></tr>
       <tr><td>Θέσεις στάθμευσης</td><td class="n">${I('coef','x','park',p.calc.coef.park)}</td><td class="hint">όταν υπάρχουν</td></tr>
     </tbody></table></div>
   </div>
   <div class="panel"><h3>Σφραγίδα μηχανικού <small class="hint" style="font-weight:400">— κοινή για όλα τα έργα</small></h3><div class="grid">
     ${E('name','Ονοματεπώνυμο')}${E('title','Ιδιότητα','span2')}${E('office','Γραφείο / εταιρεία')}${E('address','Διεύθυνση','span2')}${E('tee','Αρ. μητρώου ΤΕΕ')}${E('afm','ΑΦΜ / ΔΟΥ')}${E('phone','Τηλέφωνο')}
   </div></div>
  </section>`;
}
function vUnits(){
  const p=S.p,c=S.c,cols=AREA_COLS.filter(a=>p.calc.cols[a.k]!==false), man=p.calc.mode==='manual';
  const rows=p.units.map((u,ix)=>{ const hasL=u.levels&&u.levels.length, open=S.open.has(u.id);
    const det=open?`<tr class="detail"><td colspan="${cols.length+6}"><div class="grid">
       <label class="f"><span>Τύπος</span>${SEL('u',u.id,'type',UNIT_TYPES.map(t=>[t,t]),u.type)}</label>
       <label class="f"><span>Κτίριο (για κάθετη/μικτή)</span>${I('u',u.id,'building',u.building,'wide')}</label>
       <label class="f"><span>Συντελεστής θέσης / ορόφου</span>${I('u',u.id,'adj',u.adj??1)}</label>
       <div class="f span2"><span style="font-weight:500;font-size:12px;color:var(--muted)">Κύριοι χώροι ανά επίπεδο</span><div class="lvls">
         ${(u.levels||[]).map((l,li)=>`<div class="lvl">${SEL('lv',u.id+'|'+li,'name',LEVELS.map(x=>[x[0],x[0]]),l.name)} ${I('lv',u.id+'|'+li,'area',l.area)} m² <button class="btn ghost sm" data-act="lv-del" data-id="${u.id}" data-ix="${li}" aria-label="Αφαίρεση επιπέδου">✕</button></div>`).join('')}
         <div><button class="btn sm" data-act="lv-add" data-id="${u.id}">+ Επίπεδο</button> <span class="hint">Όταν δοθούν επίπεδα, οι κύριοι χώροι είναι το άθροισμά τους.</span></div></div></div>
       <label class="f span2"><span>Ειδικό κείμενο περιγραφής (αντικαθιστά το αυτόματο)</span><textarea rows="3" id="u-${u.id}-descr" data-coll="u" data-id="${u.id}" data-field="descr" style="font-family:var(--f-body)">${esc(u.descr)}</textarea></label>
     </div></td></tr>`:'';
    return `<tr>
      <td>${I('u',u.id,'code',u.code,'code')}<div class="hint">${esc(u.type)}${u.building?' · '+esc(u.building):''}</div></td>
      ${cols.map(a=>`<td class="n">${a.k==='main'&&hasL?`<span class="calc" data-calc="u.${u.id}.main"></span><div class="hint">${u.levels.map(l=>esc((LEVELS.find(x=>x[0]===l.name)||[0,l.name])[1])+' '+fmt(num(l.area))).join(' / ')}</div>`:I('u',u.id,a.k,u[a.k])}</td>`).join('')}
      <td class="n calc" data-calc="u.${u.id}.excl"></td>
      <td class="n calc" data-calc="u.${u.id}.park"></td>
      <td class="n">${man?I('u',u.id,'pmManual',u.pmManual):`<span class="calc" data-calc="u.${u.id}.pm"></span>`}</td>
      <td class="n calc" data-calc="u.${u.id}.plot"></td>
      <td class="act"><button class="btn ghost sm" data-act="u-open" data-id="${u.id}" aria-expanded="${open}" aria-label="Λεπτομέρειες" title="Επίπεδα, τύπος, συντελεστής, κείμενο">${open?'▴':'▾'} Στοιχεία</button><button class="btn ghost sm" data-act="u-up" data-id="${u.id}" ${ix?'':'disabled'} aria-label="Πάνω">↑</button><button class="btn ghost sm" data-act="u-del" data-id="${u.id}" aria-label="Διαγραφή">✕</button></td>
    </tr>${det}`; }).join('');
  const G=PLOT_TYPES[p.info.plotType]||PLOT_TYPES.oik;
  return `<section class="sect">
   <div class="sect-head"><div><h2>Ιδιοκτησίες & χιλιοστά</h2><p>Μία γραμμή ανά αυτοτελή ιδιοκτησία. Τα εμβαδά αποκλειστικών χρήσεων και θέσεων στάθμευσης έρχονται από την επόμενη καρτέλα. ${man?'Τα ποσοστά δίνονται χειροκίνητα.':'Τα ποσοστά υπολογίζονται αυτόματα (ρύθμιση στα Στοιχεία έργου).'}</p></div>
   </div>
   ${quickPanel()}
   <div class="row" style="justify-content:space-between"><h3 style="font-size:15px">Ιδιοκτησίες</h3><button class="btn primary" data-act="u-add">+ Ιδιοκτησία</button></div>
   <div class="tscroll"><table class="dt"><thead><tr><th>Ιδιοκτησία</th>${cols.map(a=>`<th class="n">${a.h}<br><span class="u">m²</span></th>`).join('')}<th class="n">Αποκλ. χρήσεις<br><span class="u">m²</span></th><th class="n">Στάθμευση<br><span class="u">m²</span></th><th class="n">Ποσοστό<br>‰</th><th class="n">Αναλογία ${esc(G[2])}<br><span class="u">m²</span></th><th></th></tr></thead>
   <tbody>${rows}${p.units.length?`<tr class="tot"><td>Σύνολο ιδιοκτησιών</td>${cols.map(a=>`<td class="n" data-calc="tot.${a.k}"></td>`).join('')}<td class="n" data-calc="tot.excl"></td><td class="n" data-calc="tot.park"></td><td class="n" data-calc="pmSum"></td><td class="n" data-calc="tot.plot"></td><td></td></tr>`:''}</tbody></table></div>
   ${p.units.length?'':'<p class="hint">Δεν υπάρχουν ιδιοκτησίες ακόμη. Πρόσθεσε την πρώτη με το κουμπί «+ Ιδιοκτησία».</p>'}
   ${balancePanel()}
  </section>`;
}
function quickPanel(){
  const i=S.p.info, ek=i.zone==='ektos';
  const sel=(f,opts)=>`<select id="q-${f}" data-coll="info" data-field="${f}" data-re="1">${Object.entries(opts).map(([k,v])=>`<option value="${k}" ${i[f]===k?'selected':''}>${esc(Array.isArray(v)?v[0]:v)}</option>`).join('')}</select>`;
  return `<div class="panel quick"><div class="grid">
    <label class="f"><span>Μέγεθος γης (m²)</span><input type="text" inputmode="decimal" class="num" id="q-plotArea" data-coll="info" data-field="plotArea" data-num="1" value="${esc(fin(i.plotArea))}" placeholder="π.χ. 4090,92"></label>
    <label class="f"><span>Θέση</span>${sel('zone',AREAS_ZONE)}</label>
    <label class="f"><span>Σύσταση</span>${sel('regime',REGIMES)}</label>
    <label class="f"><span>Χαρακτηρισμός</span>${sel('plotType',PLOT_TYPES)}</label>
  </div>
  ${ek&&i.regime!=='oriz'?`<label class="chk" style="margin-top:12px"><input type="checkbox" id="q-pre2011" data-coll="info" data-field="pre2011" ${i.pre2011?'checked':''}> Τα κτίσματα υπήρχαν έως 28.7.2011 (αεροφωτογραφία, βεβαίωση μηχανικού)</label>`:''}
  <p class="hint" style="margin-top:10px">Συμπληρώνεις μόνο αυτά και τα εμβαδά κάθε ιδιοκτησίας. Χιλιοστά, αναλογία γης, σύνολα, κατανομή δαπανών, περιγραφές για το συμβόλαιο και πίνακες βγαίνουν αυτόματα.${ek?' Εκτός σχεδίου το ακίνητο χαρακτηρίζεται γήπεδο ή αγροτεμάχιο.':''}</p></div>`;
}
function balancePanel(){
  const p=S.p,B=S.c.bal,G=PLOT_TYPES[p.info.plotType]||PLOT_TYPES.oik;
  const row=(l,v,sign,cls='')=>`<tr class="${cls}"><td>${sign?'<span class="hint">'+sign+'</span> ':''}${l}</td><td class="n" data-calc="bal.${v}"></td></tr>`;
  const st=B.diff==null?'':(Math.abs(B.diff)<=0.05?'<span class="badge ok">κλείνει</span>':'<span class="badge warn">διαφορά</span>');
  return `<div class="panel"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">Ισοζύγιο ${esc(G[2])}</h3>${st}</div>
   <div class="cols2"><div class="tscroll"><table class="dt"><tbody>
     ${row('Εμβαδόν '+esc(G[2]),'plot','')}
     ${row('Αποκλειστικές χρήσεις ακαλύπτου','excl','−')}
     ${row('Υπαίθριες θέσεις στάθμευσης','park','−')}
     ${row('Κοινόχρηστοι υπαίθριοι χώροι','common','−')}
     ${B.inc?'':row('Πισίνες','pools','−')}
     ${row('Υπόλοιπο = κάλυψη κτιρίων','rest','=','tot')}
     ${row('Δηλωμένη κάλυψη','cov','')}${row('Διαφορά (πρέπει 0,00)','diff','')}
   </tbody></table></div>
   <div class="sect" style="gap:10px">
     <label class="f"><span>Κάλυψη κτιρίων (m²) — από το τοπογραφικό</span><input type="text" inputmode="decimal" class="num" id="b-coverage" data-coll="info" data-field="coverage" data-num="1" value="${esc(fin(p.info.coverage))}" placeholder="για να κλείσει το ισοζύγιο"></label>
     <label class="chk"><input type="checkbox" data-coll="calcb" data-field="exclInclPool" ${B.inc?'checked':''}> Οι πισίνες περιλαμβάνονται στα εμβαδά αποκλειστικών χρήσεων</label>
     <p class="hint">Θέσεις στην πυλωτή${B.pil?' ('+fmt(B.pil)+' m²)':''} και δώματα δεν αφαιρούνται, γιατί βρίσκονται μέσα στην κάλυψη. Όλα τα εμβαδά υπολογίζονται με 2 δεκαδικά, όπως τυπώνονται.</p>
   </div></div></div>`;
}
function unitOpts(){ return [['','— επίλεξε —'],...S.p.units.map(u=>[u.id,u.code||'(χωρίς όνομα)'])]; }
function vExcl(){
  const p=S.p,c=S.c; const hasPts=c.pts.size>0;
  const rows=p.excl.map(x=>`<tr>
     <td>${SEL('x',x.id,'unit',unitOpts(),x.unit,'data-re="1"')}</td>
     <td>${SEL('x',x.id,'kind',Object.entries(KINDS).map(([k,v])=>[k,v.l]),x.kind,'data-re="1"')}</td>
     <td>${I('x',x.id,'code',x.code,'','style="width:70px"')}</td>
     <td class="n">${I('x',x.id,'area',x.area)}</td>
     <td style="min-width:320px">${I('x',x.id,'boundary',x.boundary,'wide pts','placeholder="(ΑΠ1, ΑΠ2, …, ΑΠ1)"')}</td>
     ${hasPts?`<td class="n" data-calc="x.${x.id}"></td>`:''}
     <td class="act"><button class="btn ghost sm" data-act="x-dup" data-id="${x.id}" aria-label="Αντίγραφο">⧉</button><button class="btn ghost sm" data-act="x-del" data-id="${x.id}" aria-label="Διαγραφή">✕</button></td></tr>`).join('');
  return `<section class="sect">
   <div class="sect-head"><div><h2>Αποκλειστικές χρήσεις</h2><p>Τμήματα του ακαλύπτου (κήποι, χώρος πισίνας), θέσεις στάθμευσης και δώματα που παραχωρούνται σε μία ιδιοκτησία. Τα σημεία γράφονται όπως στο διάγραμμα· πολλά πολύγωνα σε ξεχωριστές παρενθέσεις.</p></div>
   <div class="row"><button class="btn" data-act="x-add" data-kind="parking">+ Θέση στάθμευσης</button><button class="btn primary" data-act="x-add" data-kind="garden">+ Αποκλειστική χρήση</button></div></div>
   <div class="tscroll"><table class="dt"><thead><tr><th>Ιδιοκτησία</th><th>Είδος</th><th>Κωδ.</th><th class="n">Εμβαδόν <span class="u">m²</span></th><th>Σημεία ορίων</th>${hasPts?'<th class="n">Από συντετ.</th>':''}<th></th></tr></thead>
   <tbody>${rows||`<tr><td colspan="7" class="hint" style="padding:16px">Καμία αποκλειστική χρήση. Πρόσθεσε κήπο, χώρο πισίνας ή θέση στάθμευσης.</td></tr>`}
   ${p.excl.length?`<tr class="tot"><td colspan="3">Σύνολο</td><td class="n">${fmt(r2(c.tot.excl+c.tot.park+c.tot.roof))}</td><td colspan="${hasPts?3:2}" class="hint" style="font-weight:500">ακάλυπτος ${fmt(c.tot.excl)} · στάθμευση ${fmt(c.tot.park)}${c.tot.roof?' · δώμα '+fmt(c.tot.roof):''}</td></tr>`:''}</tbody></table></div>
   ${hasPts?'':'<p class="hint">Αν επικολλήσεις συντεταγμένες στην καρτέλα «Συντεταγμένες», εδώ θα εμφανίζεται το εμβαδόν κάθε πολυγώνου για έλεγχο.</p>'}
  </section>`;
}
function vCommon(){
  const p=S.p,c=S.c,hasPts=c.pts.size>0;
  const gs=p.groups.map(g=>{ const G=c.grp[g.id];
    const items=g.items.map(it=>`<tr><td style="min-width:220px">${I('ci',g.id+'|'+it.id,'name',it.name,'wide')}</td>
       <td>${SEL('ci',g.id+'|'+it.id,'zone',ZONES.map(z=>[z,z]),it.zone,'data-re="1"')}</td>
       <td>${SEL('ci',g.id+'|'+it.id,'col',[['','—'],...AREA_COLS.map(a=>[a.k,a.h])],it.col,'data-re="1"')}</td>
       <td class="n">${I('ci',g.id+'|'+it.id,'area',it.area)}</td>
       <td style="min-width:260px">${I('ci',g.id+'|'+it.id,'boundary',it.boundary,'wide pts')}</td>
       ${hasPts?`<td class="n" data-calc="c.${it.id}"></td>`:''}
       <td class="act"><button class="btn ghost sm" data-act="ci-del" data-id="${g.id}" data-ix="${it.id}" aria-label="Διαγραφή">✕</button></td></tr>`).join('');
    const zones=Object.entries(G.zone).map(([z,a])=>`${esc(z)} ${fmt(a)}`).join(' · ');
    const alloc=GU(p,g).map(id=>{const u=p.units.find(u=>u.id===id);return `<tr><td>${esc(u.code)}</td><td class="n">${g.mode==='manual'?I('al',g.id+'|'+id,'v',(g.manual||{})[id]):`<span class="calc" data-calc="g.${g.id}.${id}"></span>`}</td></tr>`;}).join('');
    return `<div class="group"><header>
        <div class="row" style="flex:1;min-width:0">${I('g',g.id,'name',g.name,'wide','style="font-weight:600;max-width:520px" aria-label="Ονομασία ομάδας"')}</div>
        <button class="btn ghost sm danger" data-act="g-del" data-id="${g.id}">Διαγραφή ομάδας</button></header>
      <div class="body">
        <div><div class="row" style="margin-bottom:8px;justify-content:space-between"><span class="hint">Συμμετέχουν στους χώρους και στις δαπάνες:</span><label class="chk"><input type="checkbox" data-coll="gall" data-id="${g.id}" ${g.all?'checked':''}> Όλες οι ιδιοκτησίες, και όσες προστεθούν</label></div><div class="chipset">${p.units.map(u=>`<label class="chip"><input type="checkbox" data-coll="gu" data-id="${g.id}" data-field="${u.id}" ${GU(p,g).includes(u.id)?'checked':''}> ${esc(u.code||'—')}</label>`).join('')}</div></div>
        <div class="cols2">
          <div style="min-width:0"><div class="tscroll"><table class="dt"><thead><tr><th>Περιγραφή χώρου</th><th>Θέση</th><th>Στήλη αναλογισμού</th><th class="n"><span class="u">m²</span></th><th>Σημεία</th>${hasPts?'<th class="n">Από συντετ.</th>':''}<th></th></tr></thead>
            <tbody>${items||`<tr><td colspan="7" class="hint" style="padding:12px">Κανένας χώρος ακόμη.</td></tr>`}${g.items.length?`<tr class="tot"><td colspan="3">Σύνολο</td><td class="n">${fmt(G.sum)}</td><td colspan="${hasPts?3:2}" class="hint" style="font-weight:500">${zones}</td></tr>`:''}</tbody></table></div>
            <div style="margin-top:8px"><button class="btn sm" data-act="ci-add" data-id="${g.id}">+ Χώρος</button></div></div>
          <div style="min-width:0"><div class="row" style="margin-bottom:8px"><span class="hint">Αναλογία δαπανών:</span>${SEL('g',g.id,'mode',[['equal','Ισόποσα'],['pm','Κατά τα χιλιοστά'],['manual','Χειροκίνητα']],g.mode,'data-re="1"')}</div>
            <div class="tscroll"><table class="dt"><thead><tr><th>Ιδιοκτησία</th><th class="n">‰</th></tr></thead><tbody>${alloc||'<tr><td colspan="2" class="hint">Επίλεξε ιδιοκτησίες.</td></tr>'}${GU(p,g).length?`<tr class="tot"><td>Σύνολο</td><td class="n" data-calc="g.${g.id}.sum"></td></tr>`:''}</tbody></table></div></div>
        </div>
      </div></div>`; }).join('');
  return `<section class="sect">
   <div class="sect-head"><div><h2>Κοινόχρηστα & κατανομή δαπανών</h2><p>Κάθε ομάδα είναι ένας πίνακας κοινοχρήστων: οι χώροι που μοιράζονται συγκεκριμένες ιδιοκτησίες και πώς επιμερίζονται οι δαπάνες τους. Η «στήλη αναλογισμού» προσθέτει τον χώρο στη γραμμή «Κοινόχρηστοι» του κύριου πίνακα (π.χ. διάδρομος αποθηκών υπογείου).</p></div>
   <div class="row"><button class="btn primary" data-act="g-add">+ Ομάδα κοινοχρήστων</button></div></div>
   ${gs||'<div class="panel"><p class="hint">Καμία ομάδα κοινοχρήστων. Για συγκρότημα όπου όλοι συμμετέχουν σε όλα, φτιάξε μία ομάδα με όλες τις ιδιοκτησίες και κατανομή κατά τα χιλιοστά.</p></div>'}
  </section>`;
}
function vCoords(){
  const p=S.p,c=S.c;
  const used=new Set(); [...p.excl.map(x=>x.boundary),...p.groups.flatMap(g=>g.items.map(i=>i.boundary)),p.info.plotBoundary].forEach(s=>parseRings(s).flat().forEach(n=>used.add(normPt(n))));
  const missing=[...used].filter(n=>n&&!/\.\.|…/.test(n)&&!c.pts.has(n));
  return `<section class="sect">
   <div class="sect-head"><div><h2>Συντεταγμένες (ΕΓΣΑ ’87)</h2><p>Επικόλλησε τον πίνακα σημείων του τοπογραφικού: ένα σημείο ανά γραμμή, «όνομα X Y» (κενό, tab ή ; ως διαχωριστικό). Χρησιμεύει για έλεγχο των εμβαδών κάθε αποκλειστικής χρήσης και κοινόχρηστου χώρου.</p></div></div>
   <div class="cols2">
     <div class="panel"><label class="f"><span>Σημεία</span><textarea rows="14" id="coords" data-coll="p" data-field="coords" placeholder="ΑΠ1  410235.120  4495120.455&#10;ΑΠ2  410262.874  4495131.020&#10;Κ1   410240.310  4495101.775">${esc(p.coords)}</textarea></label>
       <p class="hint" style="margin-top:8px"><b data-calc="ptsCount">${c.pts.size}</b> σημεία αναγνωρίστηκαν. Τα ονόματα συγκρίνονται χωρίς κενά, τελείες και κάθετες (Η/Χ14 = ΗΧ14).</p></div>
     <div class="panel"><h3>Όριο ${esc((PLOT_TYPES[p.info.plotType]||PLOT_TYPES.oik)[2])}</h3>
       <label class="f"><span>Σημεία ορίου (προαιρετικά)</span><input type="text" class="wide pts" id="info-plotBoundary" data-coll="info" data-field="plotBoundary" value="${esc(p.info.plotBoundary)}" placeholder="(1, 2, 3, …, 1)"></label>
       <p class="hint" style="margin-top:8px">Εμβαδόν από συντεταγμένες: <b data-calc="plotB">${c.plotBoundary==null?'—':fmt(c.plotBoundary)+' m²'}</b> · δηλωμένο ${fmt(num(p.info.plotArea))} m²</p>
       ${missing.length?`<p class="hint" style="margin-top:12px"><b>Σημεία που αναφέρονται στους πίνακες αλλά λείπουν:</b><br><span class="pts">${esc(missing.slice(0,80).join(', '))}${missing.length>80?' …':''}</span></p>`:(used.size&&c.pts.size?'<p class="diff-ok" style="margin-top:12px">Όλα τα σημεία των πινάκων βρέθηκαν.</p>':'')}
     </div>
   </div></section>`;
}
function vChecks(){
  const c=S.c; const order={err:0,warn:1,info:2,ok:3}, lab={err:'Σφάλμα',warn:'Προσοχή',info:'Σημείωση',ok:'Εντάξει'};
  const L=[...c.checks].sort((a,b)=>order[a.sev]-order[b.sev]);
  return `<section class="sect">
   <div class="sect-head"><div><h2>Έλεγχοι πριν την παράδοση</h2><p>Ό,τι θα ρωτούσε η συμβολαιογράφος ή το Κτηματολόγιο: αθροίσματα, κενά, διπλοεγγραφές, διαφορές εμβαδών.</p></div></div>
   <div class="checks">${L.map(x=>`<div class="ck ${x.sev}"><span class="sev">${lab[x.sev]}</span><div><p>${esc(x.msg)} ${x.tab?`<a href="#${x.tab}" class="hint">μετάβαση</a>`:''}</p>${x.sub?`<small>${esc(x.sub)}</small>`:''}</div></div>`).join('')||'<p class="hint">Κανένα εύρημα.</p>'}</div>
   <div class="panel"><h3>Υπενθυμίσεις πλαισίου</h3><div class="law">
     <p><b>Βάση σύστασης.</b> ΑΚ 1002 & 1117, ν. 3741/1929 και ν.δ. 1024/1971. Στην κάθετη ιδιοκτησία κάθε οικοδόμημα είναι χωριστή κυριότητα, ενώ το έδαφος μένει κοινό εξ αδιαιρέτου κατά το ποσοστό ‰. Τα τμήματα αποκλειστικής χρήσης δεν γίνονται αυτοτελή γεωτεμάχια.</p>
     <p><b>Τι πρέπει να ορίζει η πράξη.</b> Το οικοδόμημα κάθε ιδιοκτησίας, τα ποσοστά συγκυριότητας, τα τμήματα αποκλειστικής χρήσης, τους κοινόχρηστους χώρους, τυχόν κατανομή δικαιωμάτων δόμησης και τους περιορισμούς χρήσης.</p>
     <p><b>Εκτός σχεδίου.</b> Κάθετη ιδιοκτησία σε γήπεδο εκτός σχεδίου και εκτός οικισμού επιτρέπεται μόνο για κτίσματα που υπήρχαν έως 28.7.2011 (νόμιμα ή υπαγόμενα σε τακτοποίηση), με αεροφωτογραφία και βεβαίωση μηχανικού — άρθ. 98 ν. 4495/2017, κωδικοποιημένο πλέον στο άρθ. 385 του Κώδικα Χωροταξίας-Πολεοδομίας (ν. 5306/2026). Δεν δημιουργεί νέα δικαιώματα δόμησης.</p>
     <p><b>Θέσεις στάθμευσης.</b> Ανοιχτές θέσεις σε πυλωτή ή ακάλυπτο δίνονται ως αποκλειστική χρήση, παρακολούθημα ιδιοκτησίας κύριας χρήσης, όχι ως αυτοτελείς ιδιοκτησίες με χιλιοστά (ΟλΑΠ 23/2000). Για παλαιές συστάσεις με χιλιοστά ο ν. 5005/2022 (άρθ. 46, νέα παρ. 5Α άρθ. 1 ν. 960/1979) επιτρέπει μονομερή μετατροπή. Κλειστές θέσεις μπορούν να είναι αυτοτελείς.</p>
     <p><b>Πισίνα.</b> Δηλώνεται ως κατασκευή της ιδιοκτησίας (στήλη «Πισίνα») ή ως αποκλειστική χρήση χώρου πισίνας· κοινή πισίνα πάει σε ομάδα κοινοχρήστων.</p>
     <p><b>Κτηματολόγιο.</b> Τα διαγράμματα (τοπογραφικό, αποκλειστικές χρήσεις) υποβάλλονται ηλεκτρονικά σε ΕΓΣΑ ’87 κατά τις προδιαγραφές του Κτηματολογίου. Τα ονόματα σημείων στους πίνακες πρέπει να ταυτίζονται με του διαγράμματος.</p>
     <p class="hint">Οι υπενθυμίσεις είναι πρακτικές σημειώσεις μηχανικού και όχι νομική γνωμοδότηση· η συμβολαιογράφος κρίνει τη διατύπωση της πράξης.</p>
   </div></div></section>`;
}
function vTables(){
  const p=S.p,o=p.out||(p.out={main:true,common:true,excl:true,descr:true,coords:false});
  const C=(k,l)=>`<label class="chk"><input type="checkbox" data-coll="out" data-field="${k}" ${o[k]?'checked':''}> ${l}</label>`;
  const ne=S.c.checks.filter(x=>x.sev==='err').length;
  return `<section class="sect">
   <div class="sect-head"><div><h2>Πίνακες για τη συμβολαιογράφο</h2><p>Προεπισκόπηση σε Α4 οριζόντιο. Το PDF είναι έτοιμο για υπογραφή και αποστολή. Το Excel έχει τους ίδιους πίνακες, με τύπους στα σύνολα, για όποια επεξεργασία χρειαστεί.</p></div>
   <div class="row"><button class="btn primary" data-act="dl-pdf">Λήψη PDF</button><button class="btn primary" data-act="dl-xlsx">Λήψη Excel</button><button class="btn" data-act="copy-descr">Αντιγραφή περιγραφών</button></div></div>
   ${ne?`<div class="ck err"><span class="sev">${ne} σφάλματα</span><div><p>Υπάρχουν ανοιχτά σφάλματα. <a href="#checks">Δες τους ελέγχους</a> πριν στείλεις τους πίνακες.</p></div></div>`:''}
   <div class="row" style="gap:16px">${C('main','Πίνακας αναλογισμού')}${C('common','Κοινόχρηστα & δαπάνες')}${C('excl','Αναλυτικός αποκλειστικών χρήσεων')}${C('descr','Περιγραφές ιδιοκτησιών')}${C('coords','Συντεταγμένες σημείων')}</div>
   <div class="paperwrap" id="paper">${docHTML(p,S.c,o)}</div>
  </section>`;
}
function updateCalc(){
  const p=S.p,c=S.c,d=Number(p.calc.dec??2);
  $$('[data-calc]').forEach(el=>{ const k=el.dataset.calc.split('.'); let v='';
    if(k[0]==='pmSum') v=fmt(c.pmSum,d)+(el.closest('.fig')?'<small>‰</small>':'');
    else if(k[0]==='u'){ const cu=c.u[k[1]]; if(!cu) return; const val=cu[k[2]]; v=k[2]==='pm'?fmt(val,d):(k[2]==='excl'||k[2]==='park')&&!val?'—':fmt(val); }
    else if(k[0]==='tot') v=fmt(c.tot[k[1]]);
    else if(k[0]==='g'){ const G=c.grp[k[1]]; if(!G) return; v=k[2]==='sum'?fmt(G.allocSum,d):fmt(G.alloc[k[2]],d); }
    else if(k[0]==='x'||k[0]==='c'){ const ca=(k[0]==='x'?c.xcalc:c.ccalc)[k[1]]; const it=k[0]==='x'?p.excl.find(x=>x.id===k[1]):p.groups.flatMap(g=>g.items).find(i=>i.id===k[1]);
      if(ca==null) v='<span class="hint">—</span>'; else { const df=ca-nz(num(it&&it.area)); v=fmt(ca)+`<div class="${Math.abs(df)<=0.05?'diff-ok':'diff-bad'}">${Math.abs(df)<=0.05?'συμφωνεί':'Δ '+fmt(df)}</div>`; } }
    else if(k[0]==='bal'){ const val=c.bal[k[1]]; v=fmt(val); if(k[1]==='diff'&&val!=null) v=`<span class="${Math.abs(val)<=0.05?'diff-ok':'diff-bad'}" style="font-size:13px">${fmt(val)}</span>`; }
    else if(k[0]==='ptsCount') v=String(c.pts.size);
    else if(k[0]==='plotB') v=c.plotBoundary==null?'—':fmt(c.plotBoundary)+' m²';
    el.innerHTML=v; });
}

/* ---------- document (paper) output ---------- */
function stampHTML(p){ const e=S.settings.eng||{}, i=p.info;
  const dt=i.date?i.date.split('-').reverse().join('/'):'';
  return `<div class="sign"><div class="place">${esc(i.place||'')}${dt?', '+esc(dt):''}<br><br>Ο/Η Συντάξας/-ασα Μηχανικός</div>
   <div class="stamp"><b>${esc(e.name||'')}</b>${esc(e.title||'')}${e.office?'<br>'+esc(e.office):''}${e.address?'<br>'+esc(e.address):''}${e.tee?'<br>Α.Μ. ΤΕΕ: '+esc(e.tee):''}${e.afm?' · ΑΦΜ: '+esc(e.afm):''}${e.phone?'<br>Τηλ.: '+esc(e.phone):''}<br><br><br>(υπογραφή – σφραγίδα)</div></div>`; }
function headSub(p){ const i=p.info,G=PLOT_TYPES[i.plotType]||PLOT_TYPES.oik; const parts=[];
  if(i.location) parts.push(esc(i.location)); if(i.municipality) parts.push(esc(i.municipality)); if(i.ot) parts.push('Ο.Τ. / Θέση: '+esc(i.ot)); if(i.kaek) parts.push('ΚΑΕΚ '+esc(i.kaek));
  if(num(i.plotArea)) parts.push(`Εμβαδόν ${G[2]}: ${fmt(num(i.plotArea))} m²`); if(i.permit) parts.push('Οικ. άδεια: '+esc(i.permit));
  return parts.length?`<p class="dsub">${parts.join(' · ')}</p>`:''; }
function mainTitle(p){ if(p.info.titleOverride) return p.info.titleOverride; return {oriz:'ΠΙΝΑΚΑΣ ΑΝΑΛΟΓΙΣΜΟΥ ΟΡΙΖΟΝΤΙΩΝ ΙΔΙΟΚΤΗΣΙΩΝ',kath:'ΠΙΝΑΚΑΣ ΑΝΑΛΟΓΙΣΜΟΥ ΚΑΘΕΤΩΝ ΙΔΙΟΚΤΗΣΙΩΝ',kathoriz:'ΠΙΝΑΚΑΣ ΑΝΑΛΟΓΙΣΜΟΥ ΚΑΘΕΤΩΝ ΚΑΙ ΟΡΙΖΟΝΤΙΩΝ ΙΔΙΟΚΤΗΣΙΩΝ'}[p.info.regime]||'ΠΙΝΑΚΑΣ ΑΝΑΛΟΓΙΣΜΟΥ'; }
function ptsList(list){ return list.filter(x=>x.boundary).map(x=>esc(x.boundary)).join(' '); }
function docMain(p,c){
  const G=PLOT_TYPES[p.info.plotType]||PLOT_TYPES.oik, d=Number(p.calc.dec??2), cols=AREA_COLS.filter(a=>p.calc.cols[a.k]!==false);
  const hasRoof=c.tot.roof>0, hasPark=c.tot.park>0, hasCommonCol=Object.values(c.commonCol).some(v=>v>0);
  const colH=cols.map(a=>`<th>${a.d}<br>(m²)</th>`).join('');
  const rows=p.units.map(u=>{ const cu=c.u[u.id]; const lv=(u.levels||[]).map(l=>`${esc((LEVELS.find(x=>x[0]===l.name)||[0,l.name])[1])} ${fmt(num(l.area))}`).join(' · ');
    return `<tr><td class="lbl">${esc(u.code)}${u.building?`<span class="sm">${esc(u.building)}</span>`:''}${lv?`<span class="sm">${lv}</span>`:''}</td>
     ${cols.map(a=>`<td class="n">${fmt(cu[a.k])}</td>`).join('')}
     <td class="n">${fmt(cu.pm,d)}</td><td class="n">${fmt(cu.plot)}</td>
     <td class="pt">${cu.excl?`<b>${fmt(cu.excl)}</b> ${ptsList(cu.exclList)}`:'<div style="text-align:center">—</div>'}</td>
     ${hasPark?`<td class="pt">${cu.park?`<b>${fmt(cu.park)}</b> ${cu.parkList.map(x=>(x.code?esc(x.code)+' ':'')+(x.boundary?'('+esc(x.boundary.replace(/^\(|\)$/g,''))+')':'')).join(' ')}`:'<div style="text-align:center">—</div>'}</td>`:''}
     ${hasRoof?`<td class="pt">${cu.roof?`<b>${fmt(cu.roof)}</b> ${ptsList(cu.roofList)}`:'—'}</td>`:''}</tr>`; }).join('');
  const comRow=hasCommonCol?`<tr><td class="lbl">ΚΟΙΝΟΧΡΗΣΤΟΙ<span class="sm">${esc(p.groups.flatMap(g=>g.items.filter(i=>i.col)).map(i=>i.name).join(', '))}</span></td>${cols.map(a=>`<td class="n">${c.commonCol[a.k]?fmt(c.commonCol[a.k]):'—'}</td>`).join('')}<td class="n">—</td><td class="n">—</td><td class="c">—</td>${hasPark?'<td class="c">—</td>':''}${hasRoof?'<td class="c">—</td>':''}</tr>`:'';
  const tot=`<tr class="tot"><td class="lbl">ΣΥΝΟΛΟ</td>${cols.map(a=>`<td class="n">${fmt(r2(c.tot[a.k]+(c.commonCol[a.k]||0)))}</td>`).join('')}<td class="n">${fmt(c.pmSum,d)}</td><td class="n">${fmt(c.tot.plot)}</td><td class="n" style="text-align:left">${fmt(c.tot.excl)}</td>${hasPark?`<td class="n" style="text-align:left">${fmt(c.tot.park)}</td>`:''}${hasRoof?`<td class="n">${fmt(c.tot.roof)}</td>`:''}</tr>`;
  return `<section class="doc"><h4>${esc(mainTitle(p))}</h4>${headSub(p)}
   <table><thead><tr><th>${p.info.regime==='kath'?'ΚΑΘΕΤΕΣ':'ΟΡΙΖΟΝΤΙΕΣ'}<br>ΙΔΙΟΚΤΗΣΙΕΣ</th>${colH}<th>ΠΟΣΟΣΤΟ ΣΥΝΙΔΙΟΚΤΗΣΙΑΣ ${G[1]} (‰)</th><th>ΑΝΑΛΟΓΙΑ ${G[1]}<br>(m²)</th><th>ΕΜΒΑΔΑ ΑΠΟΚΛΕΙΣΤΙΚΩΝ ΧΡΗΣΕΩΝ ${G[1]} (m²)<br><span style="font-weight:400;text-transform:none">άνευ εμβαδών κτισμάτων, ημιυπαίθριων, δεξαμενών${p.calc.exclInclPool?'':', πισινών'}</span></th>${hasPark?'<th>ΑΠΟΚΛΕΙΣΤΙΚΕΣ ΧΡΗΣΕΙΣ ΧΩΡΩΝ ΣΤΑΘΜΕΥΣΗΣ (m²)</th>':''}${hasRoof?'<th>ΑΠΟΚΛΕΙΣΤΙΚΕΣ ΧΡΗΣΕΙΣ ΔΩΜΑΤΟΣ (m²)</th>':''}</tr></thead>
   <tbody>${rows}${comRow}${tot}</tbody></table>
   <p class="note">Τα σημεία ορίων αναφέρονται στο συνημμένο διάγραμμα αποκλειστικών χρήσεων${c.pts.size?' (συντεταγμένες ΕΓΣΑ ’87)':''}.</p>${stampHTML(p)}</section>`;
}
function docCommon(p,c){
  if(!p.groups.length) return '';
  const d=Number(p.calc.dec??2);
  const blocks=p.groups.map(g=>{ const G=c.grp[g.id]; const uc=GU(p,g).map(id=>p.units.find(u=>u.id===id)).filter(Boolean);
    const zones=[...new Set(g.items.map(i=>i.zone))];
    const left=zones.map(z=>{ const its=g.items.filter(i=>i.zone===z);
      return `<table style="margin-bottom:8px"><thead><tr><th colspan="3">ΑΝΑΛΥΣΗ ΚΟΙΝΟΧΡΗΣΤΩΝ ΧΩΡΩΝ${z!=='Υπαίθριος'?' '+UP(z==='Κτίριο'?'κτιρίου':z==='Υπόγειο'?'υπογείου':z==='Ισόγειο'?'ισογείου':'δώματος'):''} (${esc(uc.map(u=>u.code).join(', '))})</th></tr>
        <tr><th style="width:40%">ΠΕΡΙΓΡΑΦΗ ΧΩΡΩΝ</th><th style="width:14%">(m²)</th><th>ΣΗΜΕΙΑ ΠΕΡΙΓΡΑΦΗΣ ΧΩΡΟΥ</th></tr></thead>
        <tbody>${its.map(i=>`<tr><td class="lbl" style="white-space:normal">${esc(UP(i.name))}</td><td class="n">${fmt(num(i.area))}</td><td class="pt">${esc(i.boundary)||'—'}</td></tr>`).join('')}
        <tr class="tot"><td>ΣΥΝΟΛΟ ΚΟΙΝΟΧΡΗΣΤΩΝ ΧΩΡΩΝ</td><td class="n">${fmt(G.zone[z])} m²</td><td></td></tr></tbody></table>`; }).join('');
    const right=`<table><thead><tr><th colspan="2">ΑΝΑΛΟΓΙΑ ΔΑΠΑΝΩΝ ΕΠΙ ΚΟΙΝΟΧΡΗΣΤΩΝ</th></tr><tr><th>ΙΔΙΟΚΤΗΣΙΕΣ</th><th>‰</th></tr></thead><tbody>
       ${uc.map(u=>`<tr><td class="lbl">${esc(u.code)}</td><td class="n">${fmt(G.alloc[u.id],d)}</td></tr>`).join('')}<tr class="tot"><td>ΣΥΝΟΛΟ</td><td class="n">${fmt(G.allocSum,d)}</td></tr></tbody></table>
       <p class="note">Κατανομή: ${g.mode==='equal'?'ισόποσα μεταξύ των συμμετεχουσών ιδιοκτησιών':g.mode==='pm'?'κατ’ αναλογία των ποσοστών συνιδιοκτησίας':'κατά συμφωνία'}.</p>`;
    return `<div class="gtitle">${esc(UP(g.name))}</div>`+(g.items.length?`<div class="two"><div>${left}</div><div>${right}</div></div>`:`<div style="max-width:440px">${right}</div>`); }).join('');
  return `<section class="doc"><h4>ΠΙΝΑΚΑΣ ΚΟΙΝΟΧΡΗΣΤΩΝ ΧΩΡΩΝ ΚΑΙ ΚΑΤΑΝΟΜΗΣ ΔΑΠΑΝΩΝ</h4>${headSub(p)}${blocks}${stampHTML(p)}</section>`;
}
function docExcl(p,c){
  if(!p.excl.length) return '';
  const order=p.units.map(u=>u.id);
  const L=[...p.excl].sort((a,b)=>order.indexOf(a.unit)-order.indexOf(b.unit));
  return `<section class="doc"><h4>ΠΙΝΑΚΑΣ ΑΠΟΚΛΕΙΣΤΙΚΩΝ ΧΡΗΣΕΩΝ</h4>${headSub(p)}
   <table><thead><tr><th>ΙΔΙΟΚΤΗΣΙΑ</th><th>ΕΙΔΟΣ ΧΩΡΟΥ</th><th>ΚΩΔ.</th><th>ΕΜΒΑΔΟΝ (m²)</th><th>ΣΗΜΕΙΑ ΟΡΙΩΝ</th></tr></thead><tbody>
   ${L.map(x=>{const u=p.units.find(u=>u.id===x.unit);return `<tr><td class="lbl">${esc(u?u.code:'—')}</td><td>${esc((KINDS[x.kind]||KINDS.other).l)}</td><td class="c">${esc(x.code)||'—'}</td><td class="n">${fmt(num(x.area))}</td><td class="pt">${esc(x.boundary)||'—'}</td></tr>`;}).join('')}
   <tr class="tot"><td colspan="3">ΣΥΝΟΛΟ</td><td class="n">${fmt(r2(c.tot.excl+c.tot.park+c.tot.roof))}</td><td></td></tr></tbody></table>${stampHTML(p)}</section>`;
}
const LETTERS='αβγδεζηθικλμνξοπρστυφχψω';
function unitDescription(p,c,u){
  if(u.descr&&u.descr.trim()) return u.descr.trim();
  const cu=c.u[u.id],G=PLOT_TYPES[p.info.plotType]||PLOT_TYPES.oik,d=Number(p.calc.dec??2);
  const kind=p.info.regime==='kath'?'αυτοτελής και ανεξάρτητη κάθετη ιδιοκτησία':p.info.regime==='kathoriz'?'αυτοτελής και ανεξάρτητη ιδιοκτησία':'αυτοτελής και ανεξάρτητη οριζόντια ιδιοκτησία';
  const parts=[];
  if(u.levels&&u.levels.length) parts.push(u.levels.map(l=>`${String(l.name).toLowerCase().replace(/^α' |^β' |^γ' |^δ' /,m=>m.toUpperCase())} εμβαδού ${fmt(num(l.area))} τ.μ.`).join(', ')+` (σύνολο κυρίων χώρων ${fmt(cu.main)} τ.μ.)`);
  else if(cu.main) parts.push(`κύριους χώρους εμβαδού ${fmt(cu.main)} τ.μ.`);
  if(cu.semi) parts.push(`ημιυπαίθριους χώρους εμβαδού ${fmt(cu.semi)} τ.μ.`);
  if(cu.base) parts.push(`υπόγειο βοηθητικό χώρο (αποθήκη) εμβαδού ${fmt(cu.base)} τ.μ.`);
  if(cu.pool) parts.push(`πισίνα εμβαδού ${fmt(cu.pool)} τ.μ.`);
  if(cu.tanks) parts.push(`υπόγειες δεξαμενές εμβαδού ${fmt(cu.tanks)} τ.μ.`);
  let t=`${UP(u.code)}${u.building?' ('+u.building+')':''}: ${kind} (${String(u.type).toLowerCase()})`;
  if(parts.length) t+=', η οποία περιλαμβάνει '+parts.join(', ');
  t=t.replace(/\.$/,'')+`. Της αναλογεί ποσοστό συνιδιοκτησίας ${fmt(cu.pm,d)}‰ εξ αδιαιρέτου επί του όλου ${G[2]}, ήτοι ${fmt(cu.plot)} τ.μ.`;
  const xs=p.excl.filter(x=>x.unit===u.id);
  if(xs.length){ t+=` Στην ιδιοκτησία αυτή παραχωρείται, ως παρακολούθημα, το δικαίωμα αποκλειστικής χρήσης `+xs.map((x,i)=>`${xs.length>1?LETTERS[i]+') ':''}${(KINDS[x.kind]||KINDS.other).txt}${x.code?' με στοιχείο '+x.code:''} εμβαδού ${fmt(num(x.area))} τ.μ.${x.boundary?', που ορίζεται από τα σημεία '+(x.boundary.trim().startsWith('(')?x.boundary.trim():'('+x.boundary.trim()+')'):''}`).join(', ')+` του συνημμένου διαγράμματος.`; }
  const gs=p.groups.filter(g=>GU(p,g).includes(u.id));
  if(gs.length) t+=' Συμμετέχει '+gs.map(g=>`στους κοινόχρηστους χώρους «${g.name}» και στις δαπάνες τους με ποσοστό ${fmt(c.grp[g.id].alloc[u.id],d)}‰`).join(' και ')+'.';
  return t;
}
function docDescr(p,c){ return `<section class="doc"><h4>ΠΕΡΙΓΡΑΦΗ ΙΔΙΟΚΤΗΣΙΩΝ</h4>${headSub(p)}<div class="descr">${p.units.map(u=>`<p>${esc(unitDescription(p,c,u))}</p>`).join('')}</div>${stampHTML(p)}</section>`; }
function docCoords(p,c){ if(!c.pts.size) return ''; const arr=[...c.pts.values()]; const half=Math.ceil(arr.length/3);
  const t=k=>`<table><thead><tr><th>Σ.</th><th>X</th><th>Y</th></tr></thead><tbody>${arr.slice(k*half,(k+1)*half).map(([x,y,n])=>`<tr><td class="lbl">${esc(n)}</td><td class="n">${x.toFixed(3)}</td><td class="n">${y.toFixed(3)}</td></tr>`).join('')}</tbody></table>`;
  return `<section class="doc"><h4>ΠΙΝΑΚΑΣ ΣΥΝΤΕΤΑΓΜΕΝΩΝ ΣΗΜΕΙΩΝ (ΕΓΣΑ ’87)</h4>${headSub(p)}<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;align-items:start">${t(0)}${t(1)}${t(2)}</div>${stampHTML(p)}</section>`; }
function docHTML(p,c,o){ return (o.main?docMain(p,c):'')+(o.common?docCommon(p,c):'')+(o.excl?docExcl(p,c):'')+(o.descr?docDescr(p,c):'')+(o.coords?docCoords(p,c):'') || '<p class="hint">Επίλεξε τουλάχιστον έναν πίνακα.</p>'; }

/* ---------- exports ---------- */
function fileBase(p){ return (p.info.name||'pinakes').replace(/[\\/:*?"<>|]+/g,'').replace(/\s+/g,' ').trim().slice(0,80)||'pinakes'; }
async function offer(filename,data){
  if(!S.dl){ // standalone copy opened in a normal browser
    try{ const blob=data instanceof Blob?data:new Blob([data],{type:'application/octet-stream'}); const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000); toast('Λήψη: '+filename); }
    catch(e){ toast('Η λήψη αρχείων δεν είναι διαθέσιμη εδώ.'); } return; }
  try{ const r=await S.dl.save({filename,data}); if(r&&r.status==='saved') toast('Αποθηκεύτηκε: '+filename); }
  catch(e){ if(e&&e.code==='declined') return; toast(e&&e.code==='rate_limited'?'Υπάρχει ήδη ανοιχτό παράθυρο λήψης.':'Η λήψη δεν ολοκληρώθηκε.'); }
}
async function dlXLSX(btn){
  if(!await libs('xlsx',btn)) return;
  const p=S.p,c=S.c,G=PLOT_TYPES[p.info.plotType]||PLOT_TYPES.oik,d=Number(p.calc.dec??2),e=S.settings.eng||{};
  const wb=new ExcelJS.Workbook(); wb.creator=e.name||''; wb.created=new Date();
  const B={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};
  const nf=dd=>dd?'0.'+'0'.repeat(dd):'0';
  function sheet(name,widths){ const ws=wb.addWorksheet(name,{pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.4,right:.4,top:.5,bottom:.5,header:.2,footer:.2}}}); ws.columns=widths.map(w=>({width:w})); return ws; }
  function title(ws,t,n){ const r=ws.addRow([t]); ws.mergeCells(r.number,1,r.number,n); r.font={bold:true,size:13}; r.alignment={horizontal:'center'};
    const sub=[p.info.location,p.info.municipality,p.info.ot&&('Ο.Τ. / Θέση: '+p.info.ot),p.info.kaek&&('ΚΑΕΚ '+p.info.kaek),num(p.info.plotArea)&&(`Εμβαδόν ${G[2]}: ${fmt(num(p.info.plotArea))} m²`)].filter(Boolean).join(' · ');
    if(sub){ const s=ws.addRow([sub]); ws.mergeCells(s.number,1,s.number,n); s.alignment={horizontal:'center'}; s.font={size:9}; } ws.addRow([]); }
  function head(ws,arr){ const r=ws.addRow(arr); r.eachCell(cl=>{cl.font={bold:true,size:9};cl.alignment={horizontal:'center',vertical:'middle',wrapText:true};cl.border=B;cl.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F1F1'}};}); r.height=48; return r; }
  function body(ws,arr,fmts,bold){ const r=ws.addRow(arr); r.eachCell({includeEmpty:true},(cl,i)=>{cl.border=B;cl.font={size:9,bold:!!bold||i===1};cl.alignment={vertical:'middle',wrapText:true};const f=fmts&&fmts[i-1];if(f&&typeof cl.value==='number'){cl.numFmt=f;cl.alignment={horizontal:'right',vertical:'middle'};}}); if(bold) r.eachCell(cl=>cl.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F1F1'}}); return r; }
  function sign(ws,n){ ws.addRow([]); const dt=p.info.date?p.info.date.split('-').reverse().join('/'):'';
    const lines=[[`${p.info.place||''}${dt?', '+dt:''}`,e.name||''],['Ο/Η Συντάξας/-ασα Μηχανικός',e.title||''],['',e.office||''],['',e.address||''],['',[e.tee&&('Α.Μ. ΤΕΕ: '+e.tee),e.afm&&('ΑΦΜ: '+e.afm)].filter(Boolean).join(' · ')]];
    lines.forEach(([l,r],i)=>{ const row=ws.addRow([]); if(n<2){ row.getCell(1).value=r||l; row.getCell(1).font={size:9,bold:i===0}; return; } row.getCell(1).value=l; row.getCell(n).value=r; row.getCell(n).alignment={horizontal:'right'}; row.getCell(n).font={size:9,bold:i===0}; row.getCell(1).font={size:9}; }); }
  const o=p.out||{main:true,common:true,excl:true,descr:true};
  // main
  if(o.main){ const cols=AREA_COLS.filter(a=>p.calc.cols[a.k]!==false), hasPark=c.tot.park>0, hasRoof=c.tot.roof>0;
    const H=[p.info.regime==='kath'?'ΚΑΘΕΤΕΣ ΙΔΙΟΚΤΗΣΙΕΣ':'ΟΡΙΖΟΝΤΙΕΣ ΙΔΙΟΚΤΗΣΙΕΣ','ΕΠΙΠΕΔΑ',...cols.map(a=>a.d+' (m²)'),`ΠΟΣΟΣΤΟ ΣΥΝΙΔΙΟΚΤΗΣΙΑΣ ${G[1]} (‰)`,`ΑΝΑΛΟΓΙΑ ${G[1]} (m²)`,`ΑΠΟΚΛΕΙΣΤΙΚΕΣ ΧΡΗΣΕΙΣ ${G[1]} (m²)`,'ΣΗΜΕΙΑ',...(hasPark?['ΘΕΣΕΙΣ ΣΤΑΘΜΕΥΣΗΣ (m²)','ΣΗΜΕΙΑ']:[]),...(hasRoof?['ΔΩΜΑ (m²)','ΣΗΜΕΙΑ']:[])];
    const ws=sheet('Αναλογισμός',[18,16,...cols.map(()=>11),12,12,12,42,...(hasPark?[11,24]:[]),...(hasRoof?[11,24]:[])]);
    title(ws,mainTitle(p),H.length); head(ws,H);
    const F=[null,null,...cols.map(()=>'0.00'),nf(d),'0.00','0.00',null,...(hasPark?['0.00',null]:[]),...(hasRoof?['0.00',null]:[])];
    p.units.forEach(u=>{ const cu=c.u[u.id]; body(ws,[u.code+(u.building?' ('+u.building+')':''),(u.levels||[]).map(l=>`${(LEVELS.find(x=>x[0]===l.name)||[0,l.name])[1]} ${fmt(num(l.area))}`).join(' / '),...cols.map(a=>cu[a.k]??'—'),cu.pm??'—',cu.plot??'—',cu.excl||'—',cu.exclList.map(x=>x.boundary).join(' '),...(hasPark?[cu.park||'—',cu.parkList.map(x=>(x.code?x.code+' ':'')+x.boundary).join(' ')]:[]),...(hasRoof?[cu.roof||'—',cu.roofList.map(x=>x.boundary).join(' ')]:[])],F); });
    if(Object.values(c.commonCol).some(v=>v>0)) body(ws,['ΚΟΙΝΟΧΡΗΣΤΟΙ','',...cols.map(a=>c.commonCol[a.k]||'—'),'—','—','—','',...(hasPark?['—','']:[]),...(hasRoof?['—','']:[])],F);
    const lastData=ws.lastRow.number, firstData=lastData-p.units.length+1-(Object.values(c.commonCol).some(v=>v>0)?1:0);
    const tr=body(ws,['ΣΥΝΟΛΟ','',...cols.map(a=>r2(c.tot[a.k]+(c.commonCol[a.k]||0))),c.pmSum,c.tot.plot,c.tot.excl,'',...(hasPark?[c.tot.park,'']:[]),...(hasRoof?[c.tot.roof,'']:[])],F,true);
    tr.eachCell((cl,ci)=>{ if(typeof cl.value==='number'){ const L=ws.getColumn(ci).letter; cl.value={formula:`SUM(${L}${firstData}:${L}${lastData})`,result:cl.value}; } });
    sign(ws,H.length); }
  if(o.common&&p.groups.length){ const ws=sheet('Κοινόχρηστα',[44,12,48,4,22,12]); title(ws,'ΠΙΝΑΚΑΣ ΚΟΙΝΟΧΡΗΣΤΩΝ ΧΩΡΩΝ ΚΑΙ ΚΑΤΑΝΟΜΗΣ ΔΑΠΑΝΩΝ',6);
    p.groups.forEach(g=>{ const C=c.grp[g.id]; const r=ws.addRow([UP(g.name)]); r.font={bold:true,size:10}; ws.mergeCells(r.number,1,r.number,6);
      const hr=ws.addRow(['ΠΕΡΙΓΡΑΦΗ ΧΩΡΩΝ','(m²)','ΣΗΜΕΙΑ ΠΕΡΙΓΡΑΦΗΣ ΧΩΡΟΥ','','ΙΔΙΟΚΤΗΣΙΕΣ','‰']); [1,2,3,5,6].forEach(i=>{const cl=hr.getCell(i);cl.font={bold:true,size:9};cl.border=B;cl.alignment={horizontal:'center',wrapText:true};cl.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F1F1'}};});
      const uc=GU(p,g).map(id=>p.units.find(u=>u.id===id)).filter(Boolean);
      const left=g.items.map(i=>[UP(i.name)+(i.zone!=='Υπαίθριος'?' ('+i.zone+')':''),num(i.area),i.boundary||'—']); left.push(['ΣΥΝΟΛΟ',C.sum,'']);
      const right=uc.map(u=>[u.code,C.alloc[u.id]]); right.push(['ΣΥΝΟΛΟ',C.allocSum]);
      for(let k=0;k<Math.max(left.length,right.length);k++){ const L=left[k],R=right[k]; const row=ws.addRow([L?L[0]:'',L?L[1]:'',L?L[2]:'','',R?R[0]:'',R?R[1]:'']);
        if(L)[1,2,3].forEach(i=>{const cl=row.getCell(i);cl.border=B;cl.font={size:9,bold:k===left.length-1||i===1};cl.alignment={wrapText:true,vertical:'middle'};}); if(L&&typeof L[1]==='number') row.getCell(2).numFmt='0.00';
        if(R)[5,6].forEach(i=>{const cl=row.getCell(i);cl.border=B;cl.font={size:9,bold:k===right.length-1||i===5};}); if(R&&typeof R[1]==='number') row.getCell(6).numFmt=nf(d); }
      ws.addRow([]); });
    sign(ws,6); }
  if(o.excl&&p.excl.length){ const ws=sheet('Αποκλειστικές',[18,26,8,12,70]); title(ws,'ΠΙΝΑΚΑΣ ΑΠΟΚΛΕΙΣΤΙΚΩΝ ΧΡΗΣΕΩΝ',5); head(ws,['ΙΔΙΟΚΤΗΣΙΑ','ΕΙΔΟΣ ΧΩΡΟΥ','ΚΩΔ.','ΕΜΒΑΔΟΝ (m²)','ΣΗΜΕΙΑ ΟΡΙΩΝ']);
    const order=p.units.map(u=>u.id); [...p.excl].sort((a,b)=>order.indexOf(a.unit)-order.indexOf(b.unit)).forEach(x=>{const u=p.units.find(u=>u.id===x.unit);body(ws,[u?u.code:'—',(KINDS[x.kind]||KINDS.other).l,x.code||'—',num(x.area),x.boundary||'—'],[null,null,null,'0.00',null]);});
    body(ws,['ΣΥΝΟΛΟ','','',r2(c.tot.excl+c.tot.park+c.tot.roof),''],[null,null,null,'0.00',null],true); sign(ws,5); }
  if(o.descr){ const ws=sheet('Περιγραφές',[150]); title(ws,'ΠΕΡΙΓΡΑΦΗ ΙΔΙΟΚΤΗΣΙΩΝ',1); p.units.forEach(u=>{const r=ws.addRow([unitDescription(p,c,u)]);r.alignment={wrapText:true,vertical:'top'};r.font={size:10};r.height=Math.max(30,Math.ceil(unitDescription(p,c,u).length/150)*14);}); sign(ws,1); }
  if(o.coords&&c.pts.size){ const ws=sheet('Συντεταγμένες',[12,16,16]); title(ws,'ΠΙΝΑΚΑΣ ΣΥΝΤΕΤΑΓΜΕΝΩΝ (ΕΓΣΑ 87)',3); head(ws,['ΣΗΜΕΙΟ','X','Y']); [...c.pts.values()].forEach(([x,y,n])=>body(ws,[n,x,y],[null,'0.000','0.000'])); }
  if(!wb.worksheets.length){ toast('Επίλεξε τουλάχιστον έναν πίνακα.'); return; }
  const buf=await wb.xlsx.writeBuffer();
  offer(fileBase(p)+' - Πίνακες σύστασης.xlsx',new Blob([buf]));
}
const libReady={xlsx:()=>!!window.ExcelJS,pdf:()=>!!(window.pdfMake&&window.pdfMake.vfs&&window.pdfMake.vfs['Roboto-Regular.ttf'])};
const LOADERS={
  xlsx:async()=>{ const m=await import('exceljs'); window.ExcelJS=m.default||m; },
  pdf:async()=>{ const m=await import('pdfmake/build/pdfmake'); const pm=m.default||m; // το vfs_fonts.js γράφει σε «this.pdfMake», οπότε το τρέχουμε με δικό μας «this»
    const src=(await import('pdfmake/build/vfs_fonts.js?raw')).default; const holder={}; new Function(src).call(holder);
    pm.vfs=holder.pdfMake&&holder.pdfMake.vfs; window.pdfMake=pm; }};
const libLoad={};
async function libs(k,btn){
  if(libReady[k]()) return true;
  const label=btn&&btn.textContent; if(btn){ btn.disabled=true; btn.textContent='Ετοιμάζεται…'; }
  try{ libLoad[k]=libLoad[k]||LOADERS[k](); await libLoad[k]; }
  catch(e){ libLoad[k]=null; toast('Δεν φόρτωσε η βιβλιοθήκη εξαγωγής. Δοκίμασε ξανά.'); }
  finally{ if(btn){ btn.disabled=false; btn.textContent=label; } }
  return libReady[k]();
}
/* PDF: vector text, A4 landscape, same content as the preview */
function pdfDef(p,c,o){
  const G=PLOT_TYPES[p.info.plotType]||PLOT_TYPES.oik, d=Number(p.calc.dec??2), e=S.settings.eng||{}, i=p.info;
  const LAY={hLineWidth:()=>0.5,vLineWidth:()=>0.5,hLineColor:()=>'#222222',vLineColor:()=>'#222222',paddingLeft:()=>3,paddingRight:()=>3,paddingTop:()=>2.5,paddingBottom:()=>2.5};
  const H=(t,x={})=>Object.assign({text:t,bold:true,fontSize:6.5,alignment:'center',fillColor:'#f1f1f1'},x);
  const N=(v,dd=2,x={})=>Object.assign({text:fmt(v,dd),alignment:'right',noWrap:true},x);
  const L=(t,x={})=>Object.assign({text:String(t??''),bold:true},x);
  const D=()=>({text:'—',alignment:'center'});
  const subParts=[i.location,i.municipality,i.ot&&('Ο.Τ. / Θέση: '+i.ot),i.kaek&&('ΚΑΕΚ '+i.kaek),num(i.plotArea)&&`Εμβαδόν ${G[2]}: ${fmt(num(i.plotArea))} m²`,i.permit&&('Οικ. άδεια: '+i.permit)].filter(Boolean);
  const head=t=>[{text:t,bold:true,fontSize:11,alignment:'center',margin:[0,0,0,2]},subParts.length?{text:subParts.join(' · '),fontSize:7.5,alignment:'center',margin:[0,0,0,10]}:{text:'',margin:[0,0,0,8]}];
  const dt=i.date?i.date.split('-').reverse().join('/'):'';
  const sign=()=>({unbreakable:true,margin:[0,20,0,0],columns:[
    {width:'*',fontSize:8,stack:[`${i.place||''}${dt?', '+dt:''}`,{text:'Ο/Η Συντάξας/-ασα Μηχανικός',margin:[0,10,0,0]}]},
    {width:250,table:{widths:['*'],body:[[{alignment:'center',fontSize:7.5,stack:[{text:UP(e.name||''),bold:true,fontSize:8.5},e.title||'',e.office||'',e.address||'',[e.tee&&('Α.Μ. ΤΕΕ: '+e.tee),e.afm&&('ΑΦΜ: '+e.afm)].filter(Boolean).join(' · '),e.phone?('Τηλ.: '+e.phone):'',{text:'(υπογραφή – σφραγίδα)',color:'#555555',margin:[0,26,0,0]}].filter(x=>x!=='')}]]},layout:LAY}]});
  const secs=[];
  if(o.main){
    const cols=AREA_COLS.filter(a=>p.calc.cols[a.k]!==false), hasPark=c.tot.park>0, hasRoof=c.tot.roof>0, hasCom=Object.values(c.commonCol).some(v=>v>0);
    const widths=[78,...cols.map(()=>42),62,56,'*',...(hasPark?[112]:[]),...(hasRoof?[90]:[])];
    const hdr=[H(p.info.regime==='kath'?'ΚΑΘΕΤΕΣ\nΙΔΙΟΚΤΗΣΙΕΣ':'ΟΡΙΖΟΝΤΙΕΣ\nΙΔΙΟΚΤΗΣΙΕΣ'),...cols.map(a=>H(a.d+'\n(m²)')),H(`ΠΟΣΟΣΤΟ\nΣΥΝΙΔΙΟΚΤΗΣΙΑΣ\n${G[1]} (‰)`),H(`ΑΝΑΛΟΓΙΑ\n${G[1]}\n(m²)`),
      H([{text:`ΕΜΒΑΔΑ ΑΠΟΚΛΕΙΣΤΙΚΩΝ ΧΡΗΣΕΩΝ ${G[1]} (m²)\n`},{text:`άνευ εμβαδών κτισμάτων, ημιυπαίθριων, δεξαμενών${p.calc.exclInclPool?'':', πισινών'}`,bold:false,fontSize:6}]),...(hasPark?[H('ΑΠΟΚΛΕΙΣΤΙΚΕΣ ΧΡΗΣΕΙΣ ΧΩΡΩΝ ΣΤΑΘΜΕΥΣΗΣ (m²)')]:[]),...(hasRoof?[H('ΑΠΟΚΛΕΙΣΤΙΚΕΣ ΧΡΗΣΕΙΣ ΔΩΜΑΤΟΣ (m²)')]:[])];
    const pts=(v,list,fmtList)=>v?{stack:[{text:fmt(v),bold:true},{text:fmtList(list),fontSize:6,margin:[0,1,0,0]}]}:D();
    const body=[hdr];
    p.units.forEach(u=>{ const cu=c.u[u.id]; const lv=(u.levels||[]).map(l=>`${(LEVELS.find(x=>x[0]===l.name)||[0,l.name])[1]} ${fmt(num(l.area))}`).join(' · ');
      body.push([{stack:[L(u.code),...(u.building?[{text:u.building,fontSize:6.5}]:[]),...(lv?[{text:lv,fontSize:6.5,margin:[0,1,0,0]}]:[])]},
        ...cols.map(a=>cu[a.k]==null?D():N(cu[a.k])),N(cu.pm,d),N(cu.plot),
        pts(cu.excl,cu.exclList,l=>l.filter(x=>x.boundary).map(x=>x.boundary).join(' ')),
        ...(hasPark?[pts(cu.park,cu.parkList,l=>l.map(x=>(x.code?x.code+' ':'')+(x.boundary?'('+x.boundary.replace(/^\(|\)$/g,'')+')':'')).join(' '))]:[]),
        ...(hasRoof?[pts(cu.roof,cu.roofList,l=>l.map(x=>x.boundary).join(' '))]:[])]); });
    if(hasCom) body.push([{stack:[L('ΚΟΙΝΟΧΡΗΣΤΟΙ'),{text:p.groups.flatMap(g=>g.items.filter(x=>x.col)).map(x=>x.name).join(', '),fontSize:6.5}]},...cols.map(a=>c.commonCol[a.k]?N(c.commonCol[a.k]):D()),D(),D(),D(),...(hasPark?[D()]:[]),...(hasRoof?[D()]:[])]);
    const F='#f1f1f1';
    body.push([L('ΣΥΝΟΛΟ',{fillColor:F}),...cols.map(a=>N(r2(c.tot[a.k]+(c.commonCol[a.k]||0)),2,{bold:true,fillColor:F})),N(c.pmSum,d,{bold:true,fillColor:F}),N(c.tot.plot,2,{bold:true,fillColor:F}),{text:fmt(c.tot.excl),bold:true,fillColor:F},...(hasPark?[{text:fmt(c.tot.park),bold:true,fillColor:F}]:[]),...(hasRoof?[{text:fmt(c.tot.roof),bold:true,fillColor:F}]:[])]);
    secs.push([...head(mainTitle(p)),{table:{headerRows:1,dontBreakRows:true,widths,body},layout:LAY,fontSize:7.5},{text:`Τα σημεία ορίων αναφέρονται στο συνημμένο διάγραμμα αποκλειστικών χρήσεων${c.pts.size?' (συντεταγμένες ΕΓΣΑ ’87)':''}.`,fontSize:6.5,color:'#444444',margin:[0,4,0,0]},sign()]);
  }
  if(o.common&&p.groups.length){
    const st=[...head('ΠΙΝΑΚΑΣ ΚΟΙΝΟΧΡΗΣΤΩΝ ΧΩΡΩΝ ΚΑΙ ΚΑΤΑΝΟΜΗΣ ΔΑΠΑΝΩΝ')];
    p.groups.forEach(g=>{ const C=c.grp[g.id]; const uc=GU(p,g).map(id=>p.units.find(u=>u.id===id)).filter(Boolean);
      const alloc={table:{headerRows:2,widths:['*',60],body:[[H('ΑΝΑΛΟΓΙΑ ΔΑΠΑΝΩΝ ΕΠΙ ΚΟΙΝΟΧΡΗΣΤΩΝ',{colSpan:2}),{}],[H('ΙΔΙΟΚΤΗΣΙΕΣ'),H('‰')],...uc.map(u=>[L(u.code),N(C.alloc[u.id],d)]),[L('ΣΥΝΟΛΟ',{fillColor:'#f1f1f1'}),N(C.allocSum,d,{bold:true,fillColor:'#f1f1f1'})]]},layout:LAY,fontSize:7.5};
      const note={text:'Κατανομή: '+(g.mode==='equal'?'ισόποσα μεταξύ των συμμετεχουσών ιδιοκτησιών':g.mode==='pm'?'κατ’ αναλογία των ποσοστών συνιδιοκτησίας':'κατά συμφωνία')+'.',fontSize:6.5,color:'#444444',margin:[0,3,0,0]};
      const zones=[...new Set(g.items.map(x=>x.zone))];
      const zt=zones.map(z=>{ const its=g.items.filter(x=>x.zone===z); const zl=z==='Υπαίθριος'?'':' '+UP(z==='Κτίριο'?'κτιρίου':z==='Υπόγειο'?'υπογείου':z==='Ισόγειο'?'ισογείου':'δώματος');
        return {table:{headerRows:2,dontBreakRows:true,widths:['36%',52,'*'],body:[[H(`ΑΝΑΛΥΣΗ ΚΟΙΝΟΧΡΗΣΤΩΝ ΧΩΡΩΝ${zl} (${uc.map(u=>u.code).join(', ')})`,{colSpan:3}),{},{}],[H('ΠΕΡΙΓΡΑΦΗ ΧΩΡΩΝ'),H('(m²)'),H('ΣΗΜΕΙΑ ΠΕΡΙΓΡΑΦΗΣ ΧΩΡΟΥ')],
          ...its.map(x=>[L(UP(x.name)),N(a2(x.area)),{text:x.boundary||'—',fontSize:6.5}]),[L('ΣΥΝΟΛΟ ΚΟΙΝΟΧΡΗΣΤΩΝ ΧΩΡΩΝ',{fillColor:'#f1f1f1'}),N(C.zone[z],2,{bold:true,fillColor:'#f1f1f1'}),{text:'',fillColor:'#f1f1f1'}]]},layout:LAY,fontSize:7.5,margin:[0,0,0,8]}; });
      st.push({text:UP(g.name),bold:true,fontSize:8.5,margin:[0,8,0,5]});
      st.push(g.items.length?{columns:[{width:'*',stack:zt},{width:220,stack:[alloc,note]}],columnGap:12}:{columns:[{width:260,stack:[alloc,note]},{width:'*',text:''}]});
    });
    st.push(sign()); secs.push(st);
  }
  if(o.excl&&p.excl.length){
    const order=p.units.map(u=>u.id);
    const rows=[...p.excl].sort((a,b)=>order.indexOf(a.unit)-order.indexOf(b.unit)).map(x=>{const u=p.units.find(u=>u.id===x.unit);return [L(u?u.code:'—'),(KINDS[x.kind]||KINDS.other).l,{text:x.code||'—',alignment:'center'},N(a2(x.area)),{text:x.boundary||'—',fontSize:6.5}];});
    secs.push([...head('ΠΙΝΑΚΑΣ ΑΠΟΚΛΕΙΣΤΙΚΩΝ ΧΡΗΣΕΩΝ'),{table:{headerRows:1,dontBreakRows:true,widths:[80,110,40,60,'*'],body:[[H('ΙΔΙΟΚΤΗΣΙΑ'),H('ΕΙΔΟΣ ΧΩΡΟΥ'),H('ΚΩΔ.'),H('ΕΜΒΑΔΟΝ (m²)'),H('ΣΗΜΕΙΑ ΟΡΙΩΝ')],...rows,[L('ΣΥΝΟΛΟ',{colSpan:3,fillColor:'#f1f1f1'}),{},{},N(r2(c.tot.excl+c.tot.park+c.tot.roof),2,{bold:true,fillColor:'#f1f1f1'}),{text:'',fillColor:'#f1f1f1'}]]},layout:LAY,fontSize:7.5},sign()]);
  }
  if(o.descr) secs.push([...head('ΠΕΡΙΓΡΑΦΗ ΙΔΙΟΚΤΗΣΙΩΝ'),...p.units.map(u=>({text:unitDescription(p,c,u),fontSize:9,alignment:'justify',lineHeight:1.25,margin:[0,0,0,7]})),sign()]);
  if(o.coords&&c.pts.size){ const arr=[...c.pts.values()], k=Math.ceil(arr.length/3);
    const t=j=>({width:'*',table:{headerRows:1,widths:[50,'*','*'],body:[[H('Σ.'),H('X'),H('Y')],...arr.slice(j*k,(j+1)*k).map(([x,y,n])=>[L(n),{text:x.toFixed(3),alignment:'right'},{text:y.toFixed(3),alignment:'right'}])]},layout:LAY,fontSize:7.5});
    secs.push([...head('ΠΙΝΑΚΑΣ ΣΥΝΤΕΤΑΓΜΕΝΩΝ ΣΗΜΕΙΩΝ (ΕΓΣΑ ’87)'),{columns:[t(0),t(1),t(2)],columnGap:10},sign()]); }
  const content=[]; secs.forEach((sc,ix)=>{ if(ix) sc[0]=Object.assign({},sc[0],{pageBreak:'before'}); content.push(...sc); });
  return {pageSize:'A4',pageOrientation:'landscape',pageMargins:[30,28,30,34],
    info:{title:(i.name||'')+' — Πίνακες σύστασης',author:e.name||'',subject:'Πίνακες σύστασης ιδιοκτησίας'},
    defaultStyle:{font:'Roboto',fontSize:7.5,lineHeight:1.1},content,
    footer:(cp,pc)=>({margin:[30,10,30,0],columns:[{text:i.name||'',fontSize:6.5,color:'#666666'},{text:`Σελίδα ${cp} από ${pc}`,alignment:'right',fontSize:6.5,color:'#666666'}]})};
}
async function dlPDF(btn){
  const p=S.p,o=p.out||{main:true,common:true,excl:true,descr:true};
  if(!['main','common','excl','descr','coords'].some(k=>o[k])){ toast('Επίλεξε τουλάχιστον έναν πίνακα.'); return; }
  if(!await libs('pdf',btn)) return;
  try{ const def=pdfDef(p,S.c,o); if(!def.content.length){ toast('Οι επιλεγμένοι πίνακες δεν έχουν περιεχόμενο.'); return; }
    const blob=await new Promise((res,rej)=>{ try{ pdfMake.createPdf(def).getBlob(res); }catch(e){ rej(e); } });
    offer(fileBase(p)+' - Πίνακες σύστασης.pdf',blob); }
  catch(e){ toast('Το PDF δεν δημιουργήθηκε. Δοκίμασε ξανά ή κατέβασε το Excel.'); }
}
function copyText(t){ const done=()=>toast('Αντιγράφηκε'); try{ navigator.clipboard.writeText(t).then(done,()=>fallbackCopy(t)); }catch(e){ fallbackCopy(t); } }
function fallbackCopy(t){ const ta=document.createElement('textarea'); ta.value=t; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); toast('Αντιγράφηκε'); }catch(e){ toast('Επίλεξε το κείμενο και αντέγραψε το χειροκίνητα.'); } ta.remove(); }
let toastT; function toast(m){ let el=$('.toast'); if(!el){ el=document.createElement('div'); el.className='toast'; el.setAttribute('role','status'); document.body.appendChild(el);} el.textContent=m; clearTimeout(toastT); toastT=setTimeout(()=>el.remove(),2600); }

/* ---------- events ---------- */
function findIt(id){ const [gid,iid]=id.split('|'); const g=S.p.groups.find(g=>g.id===gid); return g&&g.items.find(i=>i.id===iid); }
function applyInput(el){
  const {coll,id,field}=el.dataset, p=S.p; let v=el.type==='checkbox'?el.checked:el.value;
  const isNum=el.classList.contains('n')||el.dataset.num==='1';
  if(isNum) v=num(v);
  if(coll==='info'){ p.info[field]=v; if(field==='zone'){ if(v==='ektos'){ if(p.info.plotType==='oik') p.info.plotType='gip'; } else p.info.plotType='oik'; } }
  else if(coll==='eng'){ S.settings.eng=S.settings.eng||{}; S.settings.eng[field]=v; saveSettings(); return 'soft'; }
  else if(coll==='calc'){ p.calc[field]=field==='dec'?Number(v):v; return 'hard'; }
  else if(coll==='coef') p.calc.coef[field]=v;
  else if(coll==='calcb'){ p.calc[field]=el.checked; return 'hard'; }
  else if(coll==='cols'){ p.calc.cols[field]=el.checked; return 'hard'; }
  else if(coll==='out'){ p.out=p.out||{}; p.out[field]=el.checked; return 'hard'; }
  else if(coll==='p') p[field]=v;
  else if(coll==='u'){ const u=p.units.find(u=>u.id===id); if(u) u[field]=v; if(field==='type') return 'hard'; }
  else if(coll==='lv'){ const [uid_,ix]=id.split('|'); const u=p.units.find(u=>u.id===uid_); if(u&&u.levels[ix]) u.levels[ix][field]=v; if(field==='name') return 'hard'; }
  else if(coll==='x'){ const x=p.excl.find(x=>x.id===id); if(x) x[field]=v; }
  else if(coll==='g'){ const g=p.groups.find(g=>g.id===id); if(g) g[field]=v; }
  else if(coll==='gall'){ const g=p.groups.find(g=>g.id===id); if(g){ g.all=el.checked; g.units=p.units.map(u=>u.id); } return 'hard'; }
  else if(coll==='gu'){ const g=p.groups.find(g=>g.id===id); if(g){ if(g.all){ g.all=false; g.units=p.units.map(u=>u.id); } g.units=g.units.filter(x=>x!==field); if(el.checked) g.units=p.units.map(u=>u.id).filter(x=>x===field||g.units.includes(x)); } return 'hard'; }
  else if(coll==='ci'){ const it=findIt(id); if(it) it[field]=v; }
  else if(coll==='al'){ const [gid,u]=id.split('|'); const g=p.groups.find(g=>g.id===gid); if(g){ g.manual=g.manual||{}; g.manual[u]=v; } }
  return el.dataset.re?'hard':'soft';
}
document.addEventListener('input',ev=>{ const el=ev.target; if(!el.dataset||!el.dataset.coll||el.tagName==='SELECT'||el.type==='checkbox'||el.type==='radio') return;
  const r=applyInput(el); if(el.dataset.coll==='eng') return;
  scheduleSave(); refresh(); if(TAB==='tables') $('#paper').innerHTML=docHTML(S.p,S.c,S.p.out||{});
  if(el.dataset.field==='name'&&el.dataset.coll==='info') fillProjSel();
});
document.addEventListener('change',ev=>{ const el=ev.target; if(!el.dataset||!el.dataset.coll) return;
  if(el.tagName==='SELECT'||el.type==='checkbox'||el.type==='radio'||el.type==='date'){ const r=applyInput(el); if(el.dataset.coll==='eng') return; scheduleSave(); if(r==='hard'||el.tagName==='SELECT'){ const y=window.scrollY; renderAll(); window.scrollTo(0,y);} else refresh(); }
  else if(el.dataset.field==='coords'||el.dataset.field==='plotBoundary'||el.dataset.field==='coverage'||el.dataset.field==='plotArea'){ const y=window.scrollY; renderMain(); window.scrollTo(0,y); }
});
document.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-act]'); if(!b) return; const a=b.dataset.act, p=S.p, id=b.dataset.id;
  $$('details.menu[open]').forEach(d=>d.open=false);
  const re=()=>{ const y=window.scrollY; scheduleSave(); renderAll(); window.scrollTo(0,y); };
  switch(a){
    case 'new-blank': openProject(blankProject(),true); break;
    case 'new-sample': { const s=sampleProject(); delete s.sample; s.info.name='Έργο από παράδειγμα'; openProject(s,true); break; }
    case 'import': $('#fileIn').click(); break;
    case 'dup': { const c=clone(p); c.id=newPid(); c.info.name=p.info.name+' (αντίγραφο)'; delete c.sample; openProject(c,true); break; }
    case 'backup': offer(fileBase(p)+'.json',JSON.stringify(p,null,1)); break;
    case 'backup-all': { if(S.dirty) saveNow(); const all=[...S.projects.values()]; if(S.p&&!S.projects.has(S.p.id)&&!S.p.sample) all.push(clone(S.p)); if(!all.length){ toast('Δεν υπάρχουν αποθηκευμένα έργα.'); break; }
      offer('Πίνακες σύστασης - όλα τα έργα '+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({format:'systasi-export',version:1,exportedAt:new Date().toISOString(),settings:S.settings,projects:all},null,1)); break; }
    case 'del': delProject(); break;
    case 'history': showHistory(); break;
    case 'trash': showTrash(); break;
    case 'logout': (async()=>{ if(S.dirty) await saveNow(); if(pendingIds().length){ toast('Υπάρχουν αλλαγές που δεν έχουν σταλεί ακόμη. Περίμενε σύνδεση πριν αποσυνδεθείς.'); return; } await store.auth.signOut(); })(); break;
    case 'u-add': { const u=mkUnit(uid(),'ΙΔΙΟΚΤΗΣΙΑ '+(p.units.length+1)); const prev=p.units[p.units.length-1]; if(prev){ const m=String(prev.code).match(/^(.*?)(\d+)\s*$/); if(m) u.code=m[1]+(Number(m[2])+1); u.type=prev.type; } p.units.push(u); re(); setTimeout(()=>{const el=$('#u-'+u.id+'-code'); el&&el.focus(); el&&el.select();},30); break; }
    case 'u-del': { if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='Διαγραφή;'; b.classList.add('danger'); setTimeout(()=>{ if(b.isConnected){b.dataset.armed='';b.textContent='✕';b.classList.remove('danger');}},3000); return; }
      p.units=p.units.filter(u=>u.id!==id); p.excl.forEach(x=>{ if(x.unit===id) x.unit=''; }); p.groups.forEach(g=>g.units=g.units.filter(x=>x!==id)); re(); break; }
    case 'u-up': { const i=p.units.findIndex(u=>u.id===id); if(i>0){ [p.units[i-1],p.units[i]]=[p.units[i],p.units[i-1]]; re(); } break; }
    case 'u-open': S.open.has(id)?S.open.delete(id):S.open.add(id); renderMain(); break;
    case 'lv-add': { const u=p.units.find(u=>u.id===id); const used=u.levels.map(l=>l.name); const nx=LEVELS.find(l=>!used.includes(l[0])&&l[0]!=='Υπόγειο')||LEVELS[1]; if(!u.levels.length&&num(u.main)){ u.levels.push({name:'Ισόγειο',area:num(u.main)}); } else u.levels.push({name:nx[0],area:null}); re(); break; }
    case 'lv-del': { const u=p.units.find(u=>u.id===id); u.levels.splice(Number(b.dataset.ix),1); if(!u.levels.length) u.main=null; re(); break; }
    case 'x-add': { const x={id:uid(),unit:'',kind:b.dataset.kind||'garden',code:'',area:null,boundary:''}; if(x.kind==='parking'){ const n=p.excl.filter(e=>e.kind==='parking'||e.kind==='pilotis').length+1; x.code='Σ'+n; } p.excl.push(x); re(); break; }
    case 'x-dup': { const i=p.excl.findIndex(x=>x.id===id); const x=clone(p.excl[i]); x.id=uid(); x.boundary=''; x.area=null; p.excl.splice(i+1,0,x); re(); break; }
    case 'x-del': p.excl=p.excl.filter(x=>x.id!==id); re(); break;
    case 'g-add': p.groups.push({id:uid(),name:'Κοινόχρηστοι χώροι '+(p.groups.length?p.groups.length+1:''),all:true,units:[],mode:'pm',manual:{},items:[{id:uid(),name:'',zone:'Υπαίθριος',col:'',area:null,boundary:''}]}); re(); break;
    case 'g-del': { if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='Επιβεβαίωση διαγραφής'; setTimeout(()=>{ if(b.isConnected){b.dataset.armed='';b.textContent='Διαγραφή ομάδας';}},3000); return; } p.groups=p.groups.filter(g=>g.id!==id); re(); break; }
    case 'ci-add': { const g=p.groups.find(g=>g.id===id); g.items.push({id:uid(),name:'',zone:'Υπαίθριος',col:'',area:null,boundary:''}); re(); break; }
    case 'ci-del': { const g=p.groups.find(g=>g.id===id); g.items=g.items.filter(i=>i.id!==b.dataset.ix); re(); break; }
    case 'dl-xlsx': dlXLSX(b); break;
    case 'dl-pdf': dlPDF(b); break;
    case 'copy-descr': copyText(p.units.map(u=>unitDescription(p,S.c,u)).join('\n\n')); break;
  }
});
function normProject(o){ o.id=newPid(); delete o.sample; o.excl=o.excl||[]; o.groups=o.groups||[]; o.calc=Object.assign(blankProject().calc,o.calc||{}); return o; }
async function importMany(o){ const list=o.projects.filter(x=>x&&x.info&&Array.isArray(x.units)); if(!list.length){ toast('Το αρχείο δεν περιέχει έργα.'); return; }
  if(o.settings&&o.settings.eng&&!(S.settings.eng&&S.settings.eng.tee)){ S.settings.eng=Object.assign(clone(DEFAULT_ENG),o.settings.eng); saveSettings(); }
  setStatus('busy','Εισαγωγή '+list.length+' έργων…');
  for(const x of list){ const np=normProject(clone(x)); S.p=np; S.dirty=true; await saveNow(); }
  S.open.clear(); renderAll(); toast('Εισήχθησαν '+list.length+' έργα'); }
function openProject(np,save){ S.p=np; S.open.clear(); goTab('units'); renderAll(); if(save) saveNow(); toast('Άνοιξε: '+np.info.name); }
async function delProject(){
  const p=S.p; const wasSaved=S.projects.has(p.id);
  if(!S.delArm){ S.delArm=true; toast('Πάτησε ξανά «Διαγραφή έργου» μέσα σε 4″ για επιβεβαίωση.'); setTimeout(()=>S.delArm=false,4000); return; }
  S.delArm=false; S.projects.delete(p.id);
  if(wasSaved){ try{ await store.deleteProject(p.id); cacheDrop(p.id); }catch(e){ S.projects.set(p.id,clone(p)); toast(e.kind==='network'?'Η διαγραφή χρειάζεται σύνδεση.':'Η διαγραφή απέτυχε.'); return; } }
  const list=[...S.projects.values()].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  S.p=list[0]?clone(list[0]):sampleProject(); renderAll(); toast('Το έργο διαγράφηκε — επαναφέρεται από «⋯ → Διαγραμμένα έργα»');
}
$('#projSel').addEventListener('change',e=>{ const v=S.projects.get(e.target.value); if(v){ if(S.dirty) saveNow(); S.p=clone(v); S.open.clear(); renderAll(); } });
$('#fileIn').addEventListener('change',e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader();
  r.onload=()=>{ try{ const o=JSON.parse(r.result);
      if(o&&o.format==='systasi-export'&&Array.isArray(o.projects)){ importMany(o); e.target.value=''; return; }
      if(!o||!Array.isArray(o.units)||!o.info) throw 0; openProject(normProject(o),true); }catch(err){ toast('Το αρχείο δεν είναι αντίγραφο έργου αυτής της εφαρμογής.'); } e.target.value=''; };
  r.readAsText(f); });
window.addEventListener('hashchange',()=>{ let h=''; try{ h=location.hash.replace('#',''); }catch(e){} if(TABS.some(t=>t[0]===h)) TAB_OVERRIDE=h; renderTabs(); renderMain(); window.scrollTo({top:0}); });
document.addEventListener('click',ev=>{ const a=ev.target.closest('a[href^="#"]'); if(!a) return; const t=a.getAttribute('href').slice(1); if(!TABS.some(x=>x[0]===t)) return;
  ev.preventDefault(); goTab(t); renderTabs(); renderMain(); window.scrollTo({top:0}); });

/* ---------- boot ---------- */
S.p=sampleProject(); renderAll();
initStore();


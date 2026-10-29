// Πίνακες Σύστασης Ιδιοκτησίας — υπολογισμοί (χωρίς DOM, ελέγχεται με vitest)
/* ---------- constants ---------- */
const AREA_COLS=[
  {k:'main',h:'Κύριοι χώροι',d:'ΚΥΡΙΟΙ ΧΩΡΟΙ'},
  {k:'semi',h:'Ημιυπαίθριοι',d:'ΗΜΙΥΠΑΙΘΡΙΟΙ ΧΩΡΟΙ'},
  {k:'base',h:'Υπόγ. βοηθητικοί',d:'ΥΠΟΓΕΙΟΙ ΒΟΗΘ. ΧΩΡΟΙ ΑΠΟΘΗΚΗ'},
  {k:'pool',h:'Πισίνα',d:'ΠΙΣΙΝΑ'},
  {k:'tanks',h:'Υπόγ. δεξαμενές',d:'ΥΠΟΓΕΙΕΣ ΔΕΞΑΜΕΝΕΣ'}];
const KINDS={
  garden:{l:'Κήπος / ακάλυπτος',col:'excl',txt:'τμήματος του ακαλύπτου χώρου'},
  poolarea:{l:'Χώρος πισίνας',col:'excl',txt:'του χώρου της πισίνας και του περιβάλλοντος αυτής χώρου'},
  parking:{l:'Θέση στάθμευσης (υπαίθρια)',col:'park',txt:'υπαίθριας θέσης στάθμευσης'},
  pilotis:{l:'Θέση στάθμευσης (πυλωτή)',col:'park',txt:'ανοικτής θέσης στάθμευσης στην πυλωτή'},
  roof:{l:'Δώμα / ταράτσα',col:'roof',txt:'τμήματος του δώματος'},
  other:{l:'Άλλος υπαίθριος χώρος',col:'excl',txt:'υπαίθριου χώρου'}};
const UNIT_TYPES=['Κατοικία','Διαμέρισμα','Μεζονέτα','Κατάστημα','Γραφείο','Αποθήκη','Κλειστή θέση στάθμευσης','Ανοιχτή θέση στάθμευσης'];
const LEVELS=[['Υπόγειο','ΥΠ.'],['Ισόγειο','ΙΣ.'],['Όροφος','ΟΡ.'],["Α' όροφος","Α' ΟΡ."],["Β' όροφος","Β' ΟΡ."],["Γ' όροφος","Γ' ΟΡ."],["Δ' όροφος","Δ' ΟΡ."],['Σοφίτα','ΣΟΦ.'],['Πατάρι','ΠΑΤ.']];
const ZONES=['Υπαίθριος','Ισόγειο','Υπόγειο','Κτίριο','Δώμα'];
const REGIMES={oriz:'Οριζόντια ιδιοκτησία',kath:'Κάθετη ιδιοκτησία',kathoriz:'Κάθετη και οριζόντια ιδιοκτησία'};
const PLOT_TYPES={oik:['Οικόπεδο','ΟΙΚΟΠΕΔΟΥ','οικοπέδου'],gip:['Γήπεδο','ΓΗΠΕΔΟΥ','γηπέδου'],agr:['Αγροτεμάχιο','ΑΓΡΟΤΕΜΑΧΙΟΥ','αγροτεμαχίου']};
const AREAS_ZONE={entos:'Εντός σχεδίου',oikismos:'Εντός ορίων οικισμού',ektos:'Εκτός σχεδίου / εκτός οικισμού'};
const TABS=[['info','Στοιχεία έργου'],['units','Ιδιοκτησίες & χιλιοστά'],['excl','Αποκλειστικές χρήσεις'],['common','Κοινόχρηστα & δαπάνες'],['coords','Συντεταγμένες'],['checks','Έλεγχοι'],['tables','Πίνακες για συμβολαιογράφο']];
const DEFAULT_ENG={name:'Νικόλας Αγραφιώτης',title:'Αρχιτέκτων Μηχανικός, M.Sc. ACBT TU Munich',office:'AGRAFIOTIS Architects & Associates',address:'Καυκάσου 35Β, Καλαμαριά, 55133 Θεσσαλονίκη',tee:'',afm:'',phone:''};

/* ---------- helpers ---------- */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
export const uid=()=>Math.random().toString(36).slice(2,10);
export const newPid=()=>(globalThis.crypto&&crypto.randomUUID)?crypto.randomUUID():'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(+c^Math.random()*16>>+c/4).toString(16));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));
function num(s){ if(s==null) return null; if(typeof s==='number') return isFinite(s)?s:null;
  s=String(s).trim().replace(/\s/g,''); if(!s) return null;
  if(s.includes(',')&&s.includes('.')) s=s.replace(/\./g,'').replace(',','.');
  else if(/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s=s.replace(/\./g,'');
  else s=s.replace(',','.');
  const v=parseFloat(s); return isFinite(v)?v:null; }
const nz=v=>v==null?0:v;
const r2=v=>Math.round(v*100)/100;
function fmt(v,d=2){ if(v==null||v===''||!isFinite(v)) return '—'; let n=Number(v); if(Math.abs(n)<0.5*10**-d) n=0; return n.toFixed(d).replace('.',','); }
const a2=v=>{const n=num(v);return n==null?null:r2(n);};
const fin=v=>v==null?'':(Number.isInteger(v*100)||Math.abs(v*100-Math.round(v*100))<1e-9?Number(v).toFixed(2):String(v)).replace('.',',');
const UP=s=>String(s??'').toLocaleUpperCase('el-GR').normalize('NFD').replace(/[̀-ͯ]/g,'');
function apportion(vals,total,dec){
  const f=10**dec, raw=vals.map(v=>v*f), fl=raw.map(v=>Math.floor(v+1e-7));
  let rem=Math.round(total*f)-fl.reduce((a,b)=>a+b,0);
  const ord=raw.map((v,i)=>[v-fl[i],i]).sort((a,b)=>b[0]-a[0]);
  for(let k=0;rem>0&&k<ord.length;k++,rem--) fl[ord[k][1]]++;
  for(let k=ord.length-1;rem<0&&k>=0;k--,rem++) fl[ord[k][1]]--;
  return fl.map(v=>v/f);
}
const normPt=s=>UP(s).replace(/[\s./\\-]/g,'');
function parseRings(s){
  s=String(s||'').trim(); if(!s) return [];
  const groups=s.includes('(')?[...s.matchAll(/\(([^)]*)\)/g)].map(m=>m[1]):[s];
  return groups.map(g=>g.split(/[,;]+/).map(x=>x.trim()).filter(Boolean));
}
function parsePoints(txt){
  const m=new Map();
  String(txt||'').split(/\r?\n/).forEach(line=>{
    line=line.trim(); if(!line||/^[#/]/.test(line)) return;
    let parts=/[\t; ]/.test(line)?line.split(/[\t; ]+/):line.split(',');
    parts=parts.filter(Boolean); if(parts.length<3) return;
    const x=num(parts[parts.length-2]), y=num(parts[parts.length-1]);
    const name=parts.slice(0,parts.length-2).join('');
    if(x!=null&&y!=null&&name) m.set(normPt(name),[x,y,name]);
  });
  return m;
}
function ringsArea(str,pts){
  const rings=parseRings(str); if(!rings.length||!pts.size) return null;
  let total=0;
  for(const ring of rings){
    if(ring.some(n=>/\.\.|…/.test(n))) return null;
    const P=ring.map(n=>pts.get(normPt(n))); if(P.some(p=>!p)||P.length<3) return null;
    let a=0; for(let i=0;i<P.length;i++){const p=P[i],q=P[(i+1)%P.length];a+=p[0]*q[1]-q[0]*p[1];}
    total+=Math.abs(a)/2;
  }
  return total;
}
function ringOpen(str){ return parseRings(str).some(r=>r.length>2&&!r.some(n=>/\.\.|…/.test(n))&&normPt(r[0])!==normPt(r[r.length-1])); }

/* ---------- project model ---------- */
function blankProject(){
  const u1=uid();
  return {id:newPid(),v:1,createdAt:Date.now(),updatedAt:Date.now(),
    info:{name:'Νέο έργο',owners:'',location:'',municipality:'',kaek:'',ot:'',permit:'',zone:'entos',plotType:'oik',plotArea:null,regime:'oriz',coverage:null,notary:'',place:'Θεσσαλονίκη',date:new Date().toISOString().slice(0,10),titleOverride:'',plotBoundary:''},
    calc:{mode:'auto',bldMode:'auto',dec:2,coef:{main:1,semi:0,base:0,pool:0,tanks:0,excl:0,park:0},cols:{main:true,semi:true,base:true,pool:true,tanks:true}},
    units:[mkUnit(u1,'ΚΑΤΟΙΚΙΑ 1')],
    buildings:[],excl:[],groups:[{id:uid(),name:'Γενικά κοινόχρηστα',all:true,units:[],mode:'pm',manual:{},items:[]}],coords:''};
}
const GU=(p,g)=>g.all?p.units.map(u=>u.id):g.bld?p.units.filter(u=>u.bld===g.bld).map(u=>u.id):(g.units||[]).filter(id=>p.units.some(u=>u.id===id));
function mkBuilding(code){ return {id:uid(),code:code||'',descr:'',pmManual:null}; }
const BLD_PREFIX='b:';
/** Ποιος έχει μια αποκλειστική χρήση: ιδιοκτησία (id) ή κτίριο ('b:'+id). */
function holder(p,ref){ ref=String(ref||'');
  if(ref.startsWith(BLD_PREFIX)){ const b=(p.buildings||[]).find(b=>b.id===ref.slice(2)); return b?{kind:'b',obj:b,code:b.code||'(κτίριο)'}:null; }
  const u=p.units.find(u=>u.id===ref); return u?{kind:'u',obj:u,code:u.code||'(ιδιοκτησία)'}:null; }
/** Δύο επίπεδα (κάθετη + οριζόντια) όταν υπάρχουν κτίρια και η σύσταση είναι μικτή. */
const twoLevel=p=>p.info.regime==='kathoriz'&&(p.buildings||[]).length>0;
/** Συμπληρώνει πεδία που λείπουν σε έργα παλαιότερων εκδόσεων. Δεν αλλάζει αριθμούς. */
function upgrade(p){
  p.buildings=p.buildings||[]; p.excl=p.excl||[]; p.groups=p.groups||[];
  p.calc=Object.assign({mode:'auto',bldMode:'auto',dec:2},p.calc||{});
  p.calc.coef=Object.assign({main:1,semi:0,base:0,pool:0,tanks:0,excl:0,park:0},p.calc.coef||{});
  p.calc.cols=Object.assign({main:true,semi:true,base:true,pool:true,tanks:true},p.calc.cols||{});
  (p.units||[]).forEach(u=>{
    if(u.bld===undefined){ u.bld=''; const t=String(u.building||'').trim();
      if(t){ let b=p.buildings.find(b=>UP(b.code).trim()===UP(t)); if(!b){ b=mkBuilding(t); p.buildings.push(b); } u.bld=b.id; } }
    if(u.bld&&!p.buildings.some(b=>b.id===u.bld)) u.bld='';
  });
  return p;
}
function mkUnit(id,code){return {id:id||uid(),code:code||'',type:'Κατοικία',bld:'',levels:[],main:null,semi:null,base:null,pool:null,tanks:null,pmManual:null,adj:1,descr:''};}
function sampleProject(){
  const U=[
    ['ΚΑΤΟΙΚΙΑ 1',[['Ισόγειο',103.35],['Όροφος',63.10]],null,22.96,72.75,37,null],
    ['ΚΑΤΟΙΚΙΑ 2',[],102.85,32.91,21.60,38,null],
    ['ΚΑΤΟΙΚΙΑ 3',[],99.70,15.42,26.22,38,null],
    ['ΚΑΤΟΙΚΙΑ 4',[],114.27,22.25,17.42,38,14.30],
    ['ΚΑΤΟΙΚΙΑ 5',[['Ισόγειο',102.73],['Όροφος',69.40]],null,18.40,69.75,38,null],
    ['ΚΑΤΟΙΚΙΑ 6',[],109.70,null,17.42,null,null],
    ['ΚΑΤΟΙΚΙΑ 7',[],118.75,null,17.60,null,null]];
  const units=U.map(([code,lv,main,semi,base,pool,tanks])=>{const u=mkUnit(uid(),code);u.levels=lv.map(([name,area])=>({name,area}));u.main=main;u.semi=semi;u.base=base;u.pool=pool;u.tanks=tanks;return u;});
  const id=i=>units[i].id;
  const X=(i,kind,code,area,b)=>({id:uid(),unit:id(i),kind,code,area,boundary:b});
  const excl=[
    X(0,'garden','',658.68,'(ΑΠ1, ΑΠ31, Κ40, ΗΧ1, Κ3, Κ2, Α23, ΑΠ1) (Κ1, Κ38, Κ37, Κ36, Κ35, ΑΠ29, ΑΠ28, ΑΠ27, ΑΠ26, ΑΠ25, ΑΠ38, ΑΠ39, ΑΠ30, Α25, Α24, Κ1)'),
    X(1,'garden','',540.62,'(ΑΠ1, ΑΠ31, Κ5, Κ6, Κ7, Κ48, Κ8, ΗΧ2, ΗΧ3, ΗΧ10, ΑΠ32, ΑΠ2, ΑΠ1) (ΑΠ29, ΑΠ28, ΑΠ27, ΑΠ22, ΗΧ14, ΗΧ15, ΗΧ16, ΑΠ29)'),
    X(1,'parking','Σ1',27.60,'Π1, Π2, Π11, Π12'),
    X(2,'garden','',323.97,'(ΑΠ2, ΑΠ32, Κ9, Κ10, Κ51, Κ11, Κ12, ΗΧ4, ΑΠ33, ΑΠ3, ΑΠ2) (ΑΠ19, ΑΠ18, ΑΠ17, ΑΠ16, ΑΠ11, ΗΧ11, ΗΧ12, ΗΧ13, Κ29, Κ30, ΑΠ19)'),
    X(2,'parking','Σ2',27.60,'Π2, Π3, Π10, Π11'),
    X(3,'garden','',404.77,'(ΑΠ3, ΑΠ33, ΗΧ5, ΗΧ9, Κ13, Κ14, Κ15, Κ16, ΗΧ6, ΑΠ34, ΑΠ4, ΑΠ3) (ΑΠ10, ΑΠ7, κλ5, Κ22, Κ23, Κ24, κλ2, κλ3, ΑΠ10)'),
    X(3,'parking','Σ3',27.60,'Π3, Π4, Π9, Π10'),
    X(4,'garden','',582.19,'(ΑΠ4, ΑΠ34, ΗΧ7, ΗΧ8, Κ56, Κ17, Κ18, Κ19, Κ20, ΑΠ6, ΑΠ35, ΑΠ36, ΑΠ37, ΑΠ5, Α5, Α6, …, Α18, ΑΠ4)'),
    X(5,'parking','Σ4',27.60,'Π4, Π5, Π8, Π9'),
    X(6,'parking','Σ5',27.60,'Π5, Π6, Π7, Π8')];
  const C=(name,zone,col,area,b)=>({id:uid(),name,zone,col,area,boundary:b});
  const groups=[{id:uid(),name:'Κοινόχρηστοι χώροι κατοικιών 2-3-4-6-7',units:[id(1),id(2),id(3),id(5),id(6)],mode:'equal',manual:{},items:[
    C('Κηπάρια','Υπαίθριος','',133.25,'(ΑΠ27, ΑΠ26, …, ΑΠ23, ΑΠ22, ΑΠ27) (ΑΠ16, ΑΠ15, …, ΑΠ13, ΑΠ12, ΑΠ11, ΑΠ16) (ΑΠ10, ΑΠ9, ΑΠ8, ΑΠ7, ΑΠ10)'),
    C('Χώρος parking','Υπαίθριος','',309.11,'(ΑΠ30, ΑΠ25, ΑΠ24, …, ΑΠ7, κλ7, κλ5, κλ6, …, Α26, ΑΠ30)'),
    C('Προαύλιος χώρος προς κλιμακοστάσιο κατοικίας 6','Υπαίθριος','',54.46,'(Η/Χ14, ΑΠ22, ΑΠ23, …, ΑΠ18, ΑΠ21, ΑΠ20, Η/Χ14)'),
    C('Προαύλιος χώρος προς κλιμακοστάσιο κατοικίας 7','Υπαίθριος','',7.95,'(Η/Χ14, ΑΠ22, ΑΠ23, …, ΑΠ18, ΑΠ21, ΑΠ20, Η/Χ14)'),
    C('Κλιμακοστάσιο υπογείου','Υπαίθριος','',9.94,'(Κ21, ΑΠ6, κλ6, κλ5, Κ21)'),
    C('Κλιμακοστάσιο προς κατ. 6','Υπαίθριος','',5.24,'(Κ33, κλ1, ΑΠ20, Η/Χ14, Κ33)'),
    C('Κλιμακοστάσιο προς κατ. 7','Υπαίθριος','',9.10,'(Κ27, κλ2, κλ3, κλ4, Κ27)'),
    C('Διάδρομος μεταξύ αποθηκών υπογείου','Υπόγειο','base',14.35,'')]}];
  const p=blankProject();
  Object.assign(p.info,{name:'Παράδειγμα — 7 κατοικίες (συμβολαιογράφος)',plotArea:4090.92,regime:'oriz',zone:'entos',plotType:'oik',location:'',owners:''});
  p.units=units;p.excl=excl;p.groups=groups;p.sample=true;
  return p;
}

/* ---------- computation ---------- */
function unitMain(u){ return u.levels&&u.levels.length? r2(u.levels.reduce((a,l)=>a+nz(a2(l.area)),0)) : a2(u.main); }
function compute(p){
  upgrade(p);
  const c={u:{},b:{},tot:{},checks:[],pts:parsePoints(p.coords),grp:{},xcalc:{},ccalc:{},two:twoLevel(p)};
  const plot=a2(p.info.plotArea), dec=Number(p.calc.dec??2), f=10**dec;
  const blank=()=>({excl:0,park:0,roof:0,parkOut:0,exclList:[],parkList:[],roofList:[]});
  p.units.forEach(u=>{ c.u[u.id]=Object.assign({main:unitMain(u),semi:a2(u.semi),base:a2(u.base),pool:a2(u.pool),tanks:a2(u.tanks)},blank()); });
  p.buildings.forEach(b=>{ c.b[b.id]=Object.assign({units:[],pm:null,plot:null,land:0},blank()); });
  p.excl.forEach(x=>{ const h=holder(p,x.unit); const k=KINDS[x.kind]||KINDS.other; const a=nz(a2(x.area));
    const t=h?(h.kind==='b'?c.b[h.obj.id]:c.u[h.obj.id]):null;
    if(t){ t[k.col]=r2(t[k.col]+a); t[k.col+'List'].push(x); if(x.kind!=='pilotis'&&k.col==='park') t.parkOut=r2(t.parkOut+a); }
    c.xcalc[x.id]=ringsArea(x.boundary,c.pts); });
  p.units.forEach(u=>{ if(u.bld&&c.b[u.bld]) c.b[u.bld].units.push(u.id); });
  // βάρος ιδιοκτησίας = συντελεστής θέσης × Σ(εμβαδόν × συντελεστής στήλης)
  const co=p.calc.coef||{};
  const w=p.units.map(u=>{const r=c.u[u.id];return nz(num(u.adj)??1)*(nz(co.main)*nz(r.main)+nz(co.semi)*nz(r.semi)+nz(co.base)*nz(r.base)+nz(co.pool)*nz(r.pool)+nz(co.tanks)*nz(r.tanks)+nz(co.excl)*nz(r.excl)+nz(co.park)*nz(r.park));});
  p.units.forEach((u,i)=>c.u[u.id].w=w[i]);
  const rnd=v=>v==null?null:Math.round(v*f)/f;
  let pm;
  if(!c.two){
    const W=w.reduce((a,b)=>a+b,0);
    if(p.calc.mode==='auto') pm = W>0? apportion(w.map(v=>v/W*1000),1000,dec) : p.units.map(()=>null);
    else pm=p.units.map(u=>rnd(num(u.pmManual)));
  } else {
    // 1ο επίπεδο: ‰ κάθε κτιρίου (κάθετης ιδιοκτησίας) επί του οικοπέδου
    const keys=p.buildings.map(b=>b.id); const orphan=p.units.filter(u=>!c.b[u.bld]).map(u=>u.id);
    if(orphan.length){ keys.push(''); c.b['']=Object.assign({units:orphan,pm:null,plot:null,land:0,orphan:true},blank()); }
    keys.forEach(k=>{ const B=c.b[k]; B.w=B.units.reduce((a,id)=>a+c.u[id].w,0);
      B.land=r2(B.excl+B.units.reduce((a,id)=>a+c.u[id].excl,0)); });
    const mode=p.calc.bldMode||'auto';
    let bpm;
    if(mode==='manual') bpm=keys.map(k=>k?rnd(num(p.buildings.find(b=>b.id===k).pmManual)):null);
    else { const base=keys.map(k=>mode==='land'?c.b[k].land:c.b[k].w); const T=base.reduce((a,b)=>a+b,0);
      bpm=T>0?apportion(base.map(v=>v/T*1000),1000,dec):keys.map(()=>null); }
    keys.forEach((k,i)=>c.b[k].pm=bpm[i]);
    // 2ο επίπεδο: ‰ ιδιοκτησίας επί του κτιρίου, και από αυτό επί του οικοπέδου
    pm=p.units.map(()=>null); const ix=Object.fromEntries(p.units.map((u,i)=>[u.id,i]));
    keys.forEach(k=>{ const B=c.b[k], ids=B.units; if(!ids.length) return;
      let inB;
      if(p.calc.mode==='manual') inB=ids.map(id=>rnd(num(p.units[ix[id]].pmManual)));
      else { const W=ids.reduce((a,id)=>a+c.u[id].w,0); inB=W>0?apportion(ids.map(id=>c.u[id].w/W*1000),1000,dec):ids.map(()=>null); }
      B.inSum=Math.round(inB.reduce((a,v)=>a+nz(v),0)*1e6)/1e6;
      ids.forEach((id,j)=>c.u[id].pmB=inB[j]);
      if(B.pm==null||inB.some(v=>v==null)) return;
      const ok=Math.abs(B.inSum-1000)<1e-6;
      const share=ok?apportion(inB.map(v=>B.pm*v/1000),B.pm,dec):inB.map(v=>rnd(B.pm*v/1000));
      ids.forEach((id,j)=>pm[ix[id]]=share[j]);
    });
    c.bpmSum=Math.round(keys.reduce((a,k)=>a+nz(c.b[k].pm),0)*1e6)/1e6;
  }
  p.units.forEach((u,i)=>{c.u[u.id].pm=pm[i];});
  c.pmSum=Math.round(pm.reduce((a,b)=>a+nz(b),0)*1e6)/1e6;
  // αναλογία γης σε m²: πρώτα ανά κτίριο, μετά ανά ιδιοκτησία μέσα στο κτίριο, ώστε όλα να κλείνουν
  if(plot){
    const allOk=Math.abs(c.pmSum-1000)<1e-6;
    if(c.two){
      const keys=Object.keys(c.b).filter(k=>c.b[k].units.length||k!=='');
      const bOk=Math.abs((c.bpmSum??0)-1000)<1e-6;
      const bsh=bOk?apportion(keys.map(k=>nz(c.b[k].pm)*plot/1000),plot,2):keys.map(k=>c.b[k].pm==null?null:r2(c.b[k].pm*plot/1000));
      keys.forEach((k,i)=>c.b[k].plot=c.b[k].pm==null?null:bsh[i]);
      keys.forEach(k=>{ const B=c.b[k], ids=B.units; if(!ids.length||B.plot==null) return;
        const vals=ids.map(id=>c.u[id].pm); if(vals.some(v=>v==null)) return;
        const sh=allOk?apportion(vals.map(v=>v*plot/1000),B.plot,2):vals.map(v=>r2(v*plot/1000));
        ids.forEach((id,j)=>c.u[id].plot=sh[j]); });
    } else {
      const raw=pm.map(v=>nz(v)*plot/1000); const sh=allOk?apportion(raw,plot,2):raw.map(r2);
      p.units.forEach((u,i)=>c.u[u.id].plot=pm[i]==null?null:sh[i]);
    }
  }
  // κτίρια σε απλή σύσταση: ομαδοποίηση με υποσύνολα
  Object.values(c.b).forEach(B=>{ ['main','semi','base','pool','tanks'].forEach(k=>B['u_'+k]=r2(B.units.reduce((a,id)=>a+nz(c.u[id][k]),0)));
    B.u_excl=r2(B.units.reduce((a,id)=>a+nz(c.u[id].excl),0)); B.u_park=r2(B.units.reduce((a,id)=>a+nz(c.u[id].park),0));
    if(!c.two){ B.pm=B.units.length?Math.round(B.units.reduce((a,id)=>a+nz(c.u[id].pm),0)*f)/f:null; B.plot=B.units.length?r2(B.units.reduce((a,id)=>a+nz(c.u[id].plot),0)):null; } });
  // totals
  ['main','semi','base','pool','tanks','excl','park','parkOut','roof','plot'].forEach(k=>c.tot[k]=r2(p.units.reduce((a,u)=>a+nz(c.u[u.id][k]),0)));
  const bl=Object.values(c.b); ['excl','park','parkOut','roof'].forEach(k=>{ c.tot['u_'+k]=c.tot[k]; c.tot[k]=r2(c.tot[k]+bl.reduce((a,B)=>a+nz(B[k]),0)); });
  // common groups
  c.commonCol={main:0,semi:0,base:0,pool:0,tanks:0}; c.commonOut=0; c.commonAll=0;
  p.groups.forEach(g=>{
    const G={zone:{},sum:0,alloc:{},allocSum:0};
    g.items.forEach(it=>{const a=nz(a2(it.area));G.zone[it.zone]=r2((G.zone[it.zone]||0)+a);G.sum=r2(G.sum+a);c.commonAll=r2(c.commonAll+a);
      if(it.zone==='Υπαίθριος') c.commonOut=r2(c.commonOut+a);
      if(it.col&&c.commonCol[it.col]!=null) c.commonCol[it.col]=r2(c.commonCol[it.col]+a);
      c.ccalc[it.id]=ringsArea(it.boundary,c.pts);});
    const us=GU(p,g);
    let vals;
    if(g.mode==='equal') vals=us.length?apportion(us.map(()=>1000/us.length),1000,dec):[];
    else if(g.mode==='pm'){ const s=us.reduce((a,id)=>a+nz(c.u[id].pm),0); vals=s>0?apportion(us.map(id=>nz(c.u[id].pm)/s*1000),1000,dec):us.map(()=>null);}
    else vals=us.map(id=>num((g.manual||{})[id]));
    us.forEach((id,i)=>G.alloc[id]=vals[i]);
    G.allocSum=Math.round(vals.reduce((a,b)=>a+nz(b),0)*1000)/1000;
    c.grp[g.id]=G;
  });
  c.plotBoundary=ringsArea(p.info.plotBoundary,c.pts);
  { const inc=!!p.calc.exclInclPool, pools=inc?0:c.tot.pool; const used=r2(c.tot.excl+c.tot.parkOut+c.commonOut+pools); const cov=a2(p.info.coverage);
    c.bal={plot,excl:c.tot.excl,park:c.tot.parkOut,pil:r2(c.tot.park-c.tot.parkOut),common:c.commonOut,pools,inc,used,rest:plot==null?null:r2(plot-used),cov,diff:(plot==null||cov==null)?null:r2(plot-used-cov)}; }
  c.checks=runChecks(p,c);
  return c;
}
function runChecks(p,c){
  const L=[]; const add=(sev,msg,sub,tab)=>L.push({sev,msg,sub,tab});
  const plot=num(p.info.plotArea), G=PLOT_TYPES[p.info.plotType]||PLOT_TYPES.oik;
  if(!plot) add('err',`Δεν έχει δοθεί εμβαδόν ${G[2]}.`,'Χωρίς αυτό δεν υπολογίζεται η αναλογία ανά ιδιοκτησία.','info');
  if(!p.units.length) add('err','Δεν υπάρχουν ιδιοκτησίες.','', 'units');
  if(Math.abs(c.pmSum-1000)>1e-6) add('err',`Το άθροισμα των χιλιοστών είναι ${fmt(c.pmSum,p.calc.dec)}‰ αντί 1000‰.`,p.calc.mode==='manual'?'Διόρθωσε τα χειροκίνητα ποσοστά ή άλλαξε σε αυτόματο υπολογισμό.':'Έλεγξε ότι υπάρχουν εμβαδά στις στήλες με συντελεστή.','units');
  const codes={};
  p.units.forEach(u=>{ const cu=c.u[u.id];
    if(!String(u.code).trim()) add('warn','Ιδιοκτησία χωρίς ονομασία.','Δώσε κωδικό, π.χ. «ΚΑΤΟΙΚΙΑ 3» ή «ΔΙΑΜΕΡΙΣΜΑ Α1».','units');
    const k=UP(u.code).trim(); if(k){ if(codes[k]) add('warn',`Η ονομασία «${u.code}» εμφανίζεται δύο φορές.`,'','units'); codes[k]=1; }
    if(cu.pm==null||cu.pm<=0) add('err',`Η ${u.code||'ιδιοκτησία'} δεν έχει ποσοστό συνιδιοκτησίας.`,cu.pm===0&&Number(p.calc.dec??2)<3?`Με ${p.calc.dec} δεκαδικά το ποσοστό της στρογγυλεύεται στο 0. Αύξησε τα δεκαδικά των χιλιοστών στα «Στοιχεία έργου».`:'','units');
    if(u.type==='Ανοιχτή θέση στάθμευσης') add('warn',`Η ${u.code} έχει δηλωθεί ως αυτοτελής ανοιχτή θέση στάθμευσης.`,'Ανοιχτές θέσεις στην πυλωτή ή στον ακάλυπτο δεν συνιστούν αυτοτελή οριζόντια ιδιοκτησία (ΟλΑΠ 23/2000) — δίνονται ως αποκλειστική χρήση, παρακολούθημα ιδιοκτησίας κύριας χρήσης (ν. 960/1979 άρθ. 1 παρ. 5Α, όπως προστέθηκε με ν. 5005/2022).','units');
    if(!cu.main&&!['Αποθήκη','Κλειστή θέση στάθμευσης','Ανοιχτή θέση στάθμευσης'].includes(u.type)) add('warn',`Η ${u.code||'ιδιοκτησία'} δεν έχει κύριους χώρους.`,'','units');
  });
  // κτίρια
  const d=p.calc.dec;
  if(p.info.regime==='kathoriz'&&!p.buildings.length) add('err','Η σύσταση είναι κάθετη και οριζόντια, αλλά δεν έχουν οριστεί κτίρια.','Πρόσθεσε τα κτίρια (κάθετες ιδιοκτησίες) και όρισε σε ποιο ανήκει κάθε ιδιοκτησία.','units');
  const bcodes={};
  p.buildings.forEach(b=>{ const B=c.b[b.id];
    if(!String(b.code).trim()) add('warn','Κτίριο χωρίς ονομασία.','Δώσε όνομα, π.χ. «ΚΤΙΡΙΟ Α».','units');
    const k=UP(b.code).trim(); if(k){ if(bcodes[k]) add('warn',`Το κτίριο «${b.code}» εμφανίζεται δύο φορές.`,'','units'); bcodes[k]=1; }
    if(!B.units.length) add(c.two?'err':'warn',`Το κτίριο «${b.code||'—'}» δεν έχει ιδιοκτησίες.`,c.two?'Ένα κτίριο με ποσοστό επί του οικοπέδου πρέπει να έχει τουλάχιστον μία ιδιοκτησία, αλλιώς το ποσοστό του μένει αδιάθετο.':'','units');
    if(c.two&&B.units.length&&B.inSum!=null&&Math.abs(B.inSum-1000)>1e-6) add('err',`Τα ποσοστά των ιδιοκτησιών επί του «${b.code}» αθροίζουν ${fmt(B.inSum,d)}‰ αντί 1000‰.`,'Τα χειροκίνητα ποσοστά δίνονται επί του κτιρίου και πρέπει να κλείνουν στα 1000‰ ανά κτίριο.','units');
  });
  if(c.two){
    const orph=p.units.filter(u=>!c.b[u.bld]||!u.bld);
    if(orph.length) add('err',`${orph.length===1?'Η ιδιοκτησία':'Οι ιδιοκτησίες'} ${orph.map(u=>u.code||'—').join(', ')} δεν ${orph.length===1?'ανήκει':'ανήκουν'} σε κτίριο.`,'Σε κάθετη και οριζόντια ιδιοκτησία κάθε οριζόντια ιδιοκτησία ανήκει σε ένα κτίριο.','units');
    if(Math.abs((c.bpmSum??0)-1000)>1e-6) add('err',`Τα ποσοστά των κτιρίων επί του ${G[2]} αθροίζουν ${fmt(c.bpmSum,d)}‰ αντί 1000‰.`,(p.calc.bldMode==='land')?'Ο τρόπος «κατά την αποκλειστική χρήση γης» θέλει εμβαδά αποκλειστικής χρήσης σε κάθε κτίριο.':p.calc.bldMode==='manual'?'Διόρθωσε τα ποσοστά των κτιρίων.':'','units');
  }
  const xc={};
  p.excl.forEach(x=>{ const h=holder(p,x.unit), u=h?{code:h.code}:null; const nm=(KINDS[x.kind]||KINDS.other).l;
    if(!u) add('err',`Αποκλειστική χρήση «${nm}${x.code?' '+x.code:''}» χωρίς ιδιοκτησία ή κτίριο.`,'','excl');
    if(!num(x.area)) add('warn',`Αποκλειστική χρήση «${nm}${x.code?' '+x.code:''}» (${u?u.code:'—'}) χωρίς εμβαδόν.`,'','excl');
    if(!String(x.boundary||'').trim()) add('warn',`Αποκλειστική χρήση «${nm}» της ${u?u.code:'—'} χωρίς σημεία ορίων.`,'Το συμβόλαιο χρειάζεται τα σημεία του διαγράμματος για να προσδιοριστεί ο χώρος.','excl');
    else if(x.kind!=='parking'&&x.kind!=='pilotis'&&ringOpen(x.boundary)) add('info',`Τα σημεία της «${nm}» (${u?u.code:'—'}) δεν κλείνουν στο αρχικό σημείο.`,'Συνήθως γράφεται ως κλειστή πολυγωνική, π.χ. (ΑΠ1, ΑΠ2, …, ΑΠ1).','excl');
    if(x.code){ const k=UP(x.code); if(xc[k]) add('warn',`Ο κωδικός «${x.code}» έχει δοθεί σε δύο αποκλειστικές χρήσεις.`,'','excl'); xc[k]=1; }
    const ca=c.xcalc[x.id]; if(ca!=null&&num(x.area)!=null&&Math.abs(ca-num(x.area))>0.05) add('warn',`Εμβαδόν «${nm}» (${u?u.code:'—'}): δηλωμένο ${fmt(num(x.area))} m², από συντεταγμένες ${fmt(ca)} m².`,'Διαφορά '+fmt(ca-num(x.area))+' m².','excl');
  });
  p.groups.forEach(g=>{ const C=c.grp[g.id];
    if(!GU(p,g).length) add('warn',`Η ομάδα «${g.name}» δεν έχει συμμετέχουσες ιδιοκτησίες.`,'','common');
    else if(Math.abs(C.allocSum-1000)>1e-6) add('err',`Η κατανομή δαπανών «${g.name}» αθροίζει ${fmt(C.allocSum,p.calc.dec)}‰ αντί 1000‰.`,'','common');
    g.items.forEach(it=>{const ca=c.ccalc[it.id]; if(ca!=null&&num(it.area)!=null&&Math.abs(ca-num(it.area))>0.05) add('warn',`Εμβαδόν «${it.name}»: δηλωμένο ${fmt(num(it.area))} m², από συντεταγμένες ${fmt(ca)} m².`,'','common');});
  });
  if(c.plotBoundary!=null&&plot&&Math.abs(c.plotBoundary-plot)>0.05) add('warn',`Το εμβαδόν ${G[2]} από τις συντεταγμένες είναι ${fmt(c.plotBoundary)} m² αντί ${fmt(plot)} m².`,'','coords');
  const B=c.bal;
  if(plot&&B.rest<-0.005) add('err',`Οι χώροι που έχουν κατανεμηθεί (${fmt(B.used)} m²) ξεπερνούν το εμβαδόν ${G[2]} (${fmt(plot)} m²) κατά ${fmt(-B.rest)} m².`,'Κάποιο εμβαδόν έχει μετρηθεί δύο φορές ή είναι λάθος. Δες το ισοζύγιο στην καρτέλα «Ιδιοκτησίες».','units');
  if(plot&&B.diff!=null) add(Math.abs(B.diff)<=0.05?'ok':'warn',`Ισοζύγιο ${G[2]}: ${fmt(plot)} − κατανεμημένοι υπαίθριοι ${fmt(B.used)} − κάλυψη ${fmt(B.cov)} = ${fmt(B.diff)} m².`,Math.abs(B.diff)<=0.05?'Όλο το εμβαδόν της γης έχει αποδοθεί.':(B.diff>0?'Υπάρχει εμβαδόν γης που δεν έχει αποδοθεί σε αποκλειστική ή κοινόχρηστη χρήση.':'Τα εμβαδά επικαλύπτονται ή η κάλυψη είναι λάθος.'),'units');
  else if(plot&&p.units.length&&B.used>0) add('info','Δεν έχει δοθεί κάλυψη κτιρίων, οπότε το ισοζύγιο γης δεν κλείνει πλήρως.',`Υπόλοιπο ${fmt(B.rest)} m² μετά τους υπαίθριους χώρους — πρέπει να ισούται με την κάλυψη των κτιρίων${B.inc?'':' (χωρίς πισίνες)'}.`,'units');
  if(p.info.zone==='ektos'&&plot&&plot<4000) add('warn',`${G[0]} ${fmt(plot)} m², κάτω από τη γενική αρτιότητα εκτός σχεδίου (4.000 m²).`,'Έλεγξε αν ισχύει παρέκκλιση ή μεταβατική διάταξη για το συγκεκριμένο ακίνητο.','units');
  if(p.info.zone==='ektos'&&p.info.regime!=='oriz'&&!p.info.pre2011) add('err','Κάθετη ιδιοκτησία εκτός σχεδίου: δεν έχει επιβεβαιωθεί ότι τα κτίσματα υπήρχαν έως 28.7.2011.','Σημείωσε την επιβεβαίωση στην καρτέλα «Ιδιοκτησίες» αφού ελέγξεις αεροφωτογραφία και νομιμότητα.','units');
  if(p.info.zone==='ektos'&&p.info.regime!=='oriz') add('info','Κάθετη ιδιοκτησία σε γήπεδο εκτός σχεδίου και εκτός οικισμού.','Επιτρέπεται μόνο για οικοδομήματα που υπήρχαν έως 28.7.2011, νόμιμα ή υπαγόμενα σε τακτοποίηση, με αεροφωτογραφία και βεβαίωση μηχανικού (άρθ. 98 ν. 4495/2017, πλέον άρθ. 385 Κώδικα ν. 5306/2026).','info');
  if(Math.abs(c.pmSum-1000)<=1e-6&&plot&&Math.abs(c.tot.plot-plot)<=0.005) add('ok',`Χιλιοστά 1000‰ και αναλογία ${G[2]} ${fmt(c.tot.plot)} m² — συμφωνούν.`,'','units');
  return L;
}

export { holder, twoLevel, upgrade, mkBuilding, BLD_PREFIX, AREA_COLS, KINDS, UNIT_TYPES, LEVELS, ZONES, REGIMES, PLOT_TYPES, AREAS_ZONE, TABS, DEFAULT_ENG, $, $$, esc, clone, num, nz, r2, fmt, a2, fin, UP, apportion, normPt, parseRings, parsePoints, ringsArea, ringOpen, blankProject, GU, mkUnit, sampleProject, unitMain, compute, runChecks };

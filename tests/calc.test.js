// Οι αριθμοί που πάνε στη συμβολαιογράφο: αθροίσματα, στρογγυλοποίηση, ισοζύγιο.
import { describe, it, expect } from 'vitest';
import { num, fmt, compute, blankProject, mkUnit, sampleProject } from '../src/core.js';

const cents = v => Math.round(v * 100);
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const R = (a, b) => Math.round((a + rnd() * (b - a)) * 100) / 100;

describe('ανάγνωση και εμφάνιση αριθμών', () => {
  it.each([['4.090,92', 4090.92], ['4090,92', 4090.92], ['4090.92', 4090.92], ['4.090', 4090], ['12.345.678', 12345678], ['0.125', 0.125], ['1,5', 1.5], ['', null], ['abc', null], ['-3,20', -3.2]])('%s → %s', (i, o) => expect(num(i)).toBe(o));
  it('δεν εμφανίζει -0,00', () => expect(fmt(-0.001)).toBe('0,00'));
});

describe('παράδειγμα συμβολαιογράφου (7 κατοικίες)', () => {
  const p = sampleProject(), c = compute(p);
  it('ίδια χιλιοστά με τον πίνακα της συμβολαιογράφου', () => {
    expect(p.units.map(u => c.u[u.id].pm)).toEqual([188.32, 116.37, 112.80, 129.29, 194.75, 124.12, 134.35]);
  });
  it('σύνολα 1000‰ και 4090,92 m²', () => { expect(c.pmSum).toBe(1000); expect(c.tot.plot).toBe(4090.92); });
  it('κανένα σφάλμα στους ελέγχους', () => expect(c.checks.filter(x => x.sev === 'err')).toEqual([]));
});

describe('τυχαία έργα (5.000)', () => {
  it('όλα τα αθροίσματα είναι ακριβή', () => {
    for (let t = 0; t < 5000; t++) {
      const p = blankProject(); p.units = [];
      const n = 1 + Math.floor(rnd() * 15);
      for (let i = 0; i < n; i++) {
        const u = mkUnit(null, 'Κ' + i); u.main = R(20, 250);
        if (rnd() < .5) u.semi = R(0, 40); if (rnd() < .3) u.pool = R(10, 50);
        if (rnd() < .3) u.levels = [{ name: 'Ισόγειο', area: R(30, 120) }, { name: 'Όροφος', area: R(20, 100) }];
        if (rnd() < .2) u.adj = R(0.8, 1.3);
        p.units.push(u);
        if (rnd() < .6) p.excl.push({ id: 'x' + i, unit: u.id, kind: rnd() < .3 ? 'parking' : 'garden', code: '', area: R(10, 600), boundary: '' });
      }
      p.calc.dec = [0, 1, 2, 3][Math.floor(rnd() * 4)];
      if (rnd() < .4) p.calc.coef = { main: 1, semi: R(0, 1), base: R(0, .6), pool: R(0, .3), tanks: 0, excl: R(0, .1), park: R(0, .2) };
      p.info.plotArea = R(300, 20000);
      const g = p.groups[0]; g.mode = t % 2 ? 'equal' : 'pm';
      if (t % 3 === 0) { g.all = false; g.units = p.units.filter((_, i) => i % 2 === 0).map(u => u.id); }
      const c = compute(p), d = p.calc.dec, f = 10 ** d;
      expect(p.units.reduce((a, u) => a + Math.round(c.u[u.id].pm * f), 0)).toBe(1000 * f);
      expect(p.units.reduce((a, u) => a + cents(c.u[u.id].plot), 0)).toBe(cents(p.info.plotArea));
      const W = p.units.reduce((a, u) => a + c.u[u.id].w, 0);
      p.units.forEach(u => expect(Math.abs(c.u[u.id].w / W * 1000 - c.u[u.id].pm)).toBeLessThanOrEqual(1 / f + 1e-9));
      ['main', 'semi', 'pool', 'excl', 'park'].forEach(k => expect(p.units.reduce((a, u) => a + cents(c.u[u.id][k] || 0), 0)).toBe(cents(c.tot[k])));
      p.units.forEach(u => { if (u.levels.length) expect(u.levels.reduce((a, l) => a + cents(l.area), 0)).toBe(cents(c.u[u.id].main)); });
      expect(Object.values(c.grp[g.id].alloc).reduce((a, v) => a + Math.round(v * f), 0)).toBe(1000 * f);
      expect(cents(c.bal.plot) - cents(c.bal.used)).toBe(cents(c.bal.rest));
    }
  });
  it('τρεις ίσες ιδιοκτησίες: 333,34 / 333,33 / 333,33', () => {
    const p = blankProject(); p.units = ['Α', 'Β', 'Γ'].map(x => { const u = mkUnit(null, x); u.main = 100; return u; }); p.info.plotArea = 1000;
    const c = compute(p); expect(p.units.map(u => c.u[u.id].pm)).toEqual([333.34, 333.33, 333.33]);
  });
});

describe('κτίρια — κάθετη και οριζόντια ιδιοκτησία (δύο επίπεδα)', async () => {
  const { mkBuilding } = await import('../src/core.js');
  it('παράδειγμα: Α 446,40‰ · Α1 544,16‰ επί του Α → 242,91‰ επί του οικοπέδου', () => {
    const p = blankProject(); p.info.plotArea = 1369; p.info.regime = 'kathoriz'; p.calc.bldMode = 'manual';
    const A = mkBuilding('ΚΤΙΡΙΟ Α'), B = mkBuilding('ΚΤΙΡΙΟ Β'); A.pmManual = 446.4; B.pmManual = 553.6; p.buildings = [A, B]; p.units = [];
    [['Α1', 95.5, A], ['Α2', 80, A], ['Β1', 120, B], ['Β2', 60, B], ['Β3', 60, B]].forEach(([n, a, b]) => { const u = mkUnit(null, n); u.main = a; u.bld = b.id; p.units.push(u); });
    const c = compute(p);
    expect(c.u[p.units[0].id].pmB).toBe(544.16); expect(c.u[p.units[0].id].pm).toBe(242.91);
    expect(c.b[A.id].plot + c.b[B.id].plot).toBeCloseTo(1369, 9);
    expect(c.checks.filter(x => x.sev === 'err')).toEqual([]);
  });
  it('παλιά έργα: το πεδίο «κτίριο» γίνεται κτίριο', () => {
    const p = blankProject(); delete p.buildings; const u = p.units[0]; delete u.bld; u.building = 'Κτίριο Γ'; u.main = 50; p.info.plotArea = 500;
    compute(p); expect(p.buildings.map(b => b.code)).toEqual(['Κτίριο Γ']); expect(u.bld).toBe(p.buildings[0].id);
  });
  it('3.000 τυχαία συγκροτήματα: όλα κλείνουν σε κάθε επίπεδο', () => {
    for (let t = 0; t < 3000; t++) {
      const p = blankProject(); p.info.regime = 'kathoriz'; p.units = []; p.buildings = []; p.excl = [];
      p.calc.dec = [0, 1, 2, 3][t % 4]; p.calc.bldMode = ['auto', 'land', 'manual'][t % 3]; p.info.plotArea = R(400, 30000);
      const nb = 1 + Math.floor(rnd() * 5); let left = 1000;
      for (let k = 0; k < nb; k++) { const b = mkBuilding('Κ' + k); p.buildings.push(b);
        const ff = 10 ** p.calc.dec; const share = k === nb - 1 ? left : Math.round(left / (nb - k) * (0.6 + rnd() * 0.8) * ff) / ff; left = Math.round((left - share) * ff) / ff; b.pmManual = share;
        p.excl.push({ id: 'b' + k, unit: 'b:' + b.id, kind: 'garden', area: R(p.info.plotArea / (nb * 6), p.info.plotArea / (nb * 2)), boundary: '' });
        const nu = 1 + Math.floor(rnd() * 6);
        for (let i = 0; i < nu; i++) { const u = mkUnit(null, 'Κ' + k + '.' + i); u.main = R(25, 220); if (rnd() < .4) u.semi = R(2, 30); u.bld = b.id; p.units.push(u); } }
      if (rnd() < .3) p.calc.coef = { main: 1, semi: R(0, 1), base: 0, pool: 0, tanks: 0, excl: 0, park: 0 };
      const c = compute(p), d = p.calc.dec, f = 10 ** d, I = v => Math.round(v * f);
      expect(c.checks.filter(x => x.sev === 'err').map(x => x.msg)).toEqual([]);
      expect(p.buildings.reduce((a, b) => a + I(c.b[b.id].pm), 0)).toBe(1000 * f);
      expect(p.units.reduce((a, u) => a + I(c.u[u.id].pm), 0)).toBe(1000 * f);
      expect(p.buildings.reduce((a, b) => a + cents(c.b[b.id].plot), 0)).toBe(cents(p.info.plotArea));
      p.buildings.forEach(b => { const B = c.b[b.id], us = p.units.filter(u => u.bld === b.id);
        expect(us.reduce((a, u) => a + I(c.u[u.id].pmB), 0)).toBe(1000 * f);
        expect(us.reduce((a, u) => a + I(c.u[u.id].pm), 0)).toBe(I(B.pm));
        expect(us.reduce((a, u) => a + cents(c.u[u.id].plot), 0)).toBe(cents(B.plot));
        us.forEach(u => expect(Math.abs(c.u[u.id].pm - B.pm * c.u[u.id].pmB / 1000)).toBeLessThanOrEqual(1 / f + 1e-9)); });
      expect(p.units.reduce((a, u) => a + cents(c.u[u.id].plot), 0)).toBe(cents(p.info.plotArea));
    }
  });
});

describe('μέθοδοι του πίνακα αναλογισμού (στάθμες, όγκος, κλείδωμα, δαπάνες, ψήφοι)', async () => {
  const m = await import('../src/core.js');
  const mk = (rows, plot = 332) => { const p = blankProject(); p.info.plotArea = plot; p.units = rows.map(([n, a, f = 0, h = null]) => { const u = mkUnit(null, n); u.main = a; u.floor = f; u.height = h; return u; }); return p; };
  const pmOf = (p, c) => p.units.map(u => c.u[u.id].pm);

  it('παράδειγμα Μαυρογένη (4 διαμερίσματα, όγκος, ίδιο ύψος): ίδια ‰ και m²', () => {
    const p = mk([['Α1', 44.93, 1, 3], ['Α2', 23.94, 1, 3], ['Α3', 41.10, 1, 3], ['Α4', 2.61, 1, 3]]); p.calc.basis = 'volume';
    const c = compute(p);
    expect(pmOf(p, c)).toEqual([399.10, 212.65, 365.07, 23.18]); // το αρχείο δίνει 399,09 / 23,19 — ίδιο σύνολο, άλλη στρογγυλοποίηση
    expect(p.units.map(u => c.u[u.id].plot)).toEqual([132.5, 70.6, 121.2, 7.7]);
    expect(p.units.map(u => c.u[u.id].vol)).toEqual([134.79, 71.82, 123.3, 7.83]);
    expect(p.units.map(u => c.u[u.id].votes)).toEqual([399, 213, 365, 23]);
  });
  it('συντελεστής αξίας: υπόγειο 0,50 · ισόγειο 1,00 · 2ος 1,10', () => {
    const p = mk([['ΥΠ', 100, -1], ['ΙΣ', 100, 0], ['Β', 100, 2]]); p.calc.valueMode = 'floor';
    const c = compute(p); const W = 0.5 + 1 + 1.1;
    expect(pmOf(p, c)).toEqual([192.31, 384.61, 423.08]); // ακριβή 192,3077 / 384,6154 / 423,0769 — μεγαλύτερο υπόλοιπο
    expect(c.pmSum).toBe(1000);
  });
  it('κλείδωμα: αποθήκη 15‰, οι υπόλοιπες μοιράζονται τα 985‰ αναλογικά', () => {
    const p = mk([['Α1', 80], ['Α2', 120], ['ΑΠ', 10]]); p.units[2].pmFixed = 15;
    const c = compute(p);
    expect(pmOf(p, c)).toEqual([394, 591, 15]);
    expect(c.checks.filter(x => x.sev === 'err')).toEqual([]);
  });
  it('κλειδωμένα πάνω από 1000‰ → σφάλμα', () => {
    const p = mk([['Α1', 80], ['Α2', 120]]); p.units[0].pmFixed = 700; p.units[1].pmFixed = 400;
    expect(compute(p).checks.some(x => x.sev === 'err' && /κλειδωμένα/.test(x.msg))).toBe(true);
  });
  it('ανελκυστήρας: ισόγειο 0, α΄ 1,00, β΄ 1,10 επί όγκου · θέρμανση με συντελεστή από μελέτη', () => {
    const p = mk([['ΙΣ', 100, 0], ['Α', 100, 1], ['Β', 100, 2]]);
    p.groups = [{ id: 'el', name: 'Ανελκυστήρας', all: true, units: [], mode: 'elevator', manual: {}, fixed: {}, items: [] },
                { id: 'ht', name: 'Θέρμανση', all: true, units: [], mode: 'heating', manual: {}, fixed: {}, items: [] }];
    p.calc.heatCoef = { '2': 1.2 };
    const c = compute(p), el = c.grp.el.alloc, ht = c.grp.ht.alloc;
    expect(p.units.map(u => el[u.id])).toEqual([0, 476.19, 523.81]);
    expect(p.units.map(u => ht[u.id])).toEqual([312.5, 312.5, 375]);
    expect(c.grp.el.allocSum).toBe(1000);
  });
  it('κλείδωμα σε κατανομή δαπανών', () => {
    const p = mk([['Α', 100], ['Β', 100], ['Γ', 100]]); p.groups = [{ id: 'g', name: 'Κ', all: true, units: [], mode: 'equal', manual: {}, fixed: {}, items: [] }];
    p.groups[0].fixed[p.units[2].id] = 100; const c = compute(p);
    expect(p.units.map(u => c.grp.g.alloc[u.id])).toEqual([450, 450, 100]);
  });
  it('2.000 τυχαία έργα με στάθμες, όγκο, κλειδώματα: όλα κλείνουν, ψήφοι = 1000', () => {
    for (let t = 0; t < 2000; t++) {
      const n = 2 + Math.floor(rnd() * 12);
      const p = mk(Array.from({ length: n }, (_, i) => ['Κ' + i, R(15, 200), i === 0 ? 1 : Math.floor(rnd() * 7) - 1, rnd() < .5 ? R(2.6, 4.2) : null]), R(200, 9000));
      p.calc.dec = [1, 2, 3][t % 3]; p.calc.basis = t % 2 ? 'volume' : 'area'; p.calc.valueMode = t % 4 < 2 ? 'floor' : 'none';
      const f = 10 ** p.calc.dec; let budget = 300;
      p.units.forEach((u, i) => { if (i < n - 1 && rnd() < .2) { const v = Math.round(R(1, budget / 3) * f) / f; budget -= v; u.pmFixed = v; } });
      p.groups = [{ id: 'el', name: 'Α', all: true, units: [], mode: 'elevator', manual: {}, fixed: {}, items: [] }, { id: 'v', name: 'Β', all: true, units: [], mode: 'volume', manual: {}, fixed: {}, items: [] }];
      const c = compute(p), I = v => Math.round(v * f);
      expect(c.checks.filter(x => x.sev === 'err').map(x => x.msg)).toEqual([]);
      expect(p.units.reduce((a, u) => a + I(c.u[u.id].pm), 0)).toBe(1000 * f);
      p.units.forEach(u => { if (u.pmFixed != null) expect(c.u[u.id].pm).toBe(u.pmFixed); });
      expect(p.units.reduce((a, u) => a + c.u[u.id].votes, 0)).toBe(1000);
      expect(p.units.reduce((a, u) => a + cents(c.u[u.id].plot), 0)).toBe(cents(p.info.plotArea));
      ['el', 'v'].forEach(g => { if (Object.values(c.grp[g].alloc).some(v => v > 0)) expect(Object.values(c.grp[g].alloc).reduce((a, v) => a + I(v || 0), 0)).toBe(1000 * f); });
    }
  });
});

// Δοκιμή του σχήματος σε πραγματική Postgres (PGlite) με ψεύτικο auth.uid().
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
let db;
const as = async (uid, sql, params) => {
  await db.exec(`set role authenticated; select set_config('test.uid','${uid}',false);`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create role anon; create role authenticated;
    grant usage on schema auth to authenticated, anon;
    insert into auth.users values ('${A}'), ('${B}');
  `);
  const dir = new URL('../supabase/migrations/', import.meta.url);
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), 'utf8').replace(/create extension[^;]*;/i, ''));
  await db.exec(`grant usage on schema public to authenticated, anon;
    grant select, insert, update, delete on all tables in schema public to authenticated, anon;`);
});

describe('σχήμα βάσης', () => {
  it('ο χρήστης δημιουργεί και βλέπει μόνο τα δικά του έργα', async () => {
    await as(A, `insert into public.projects (id, name, data) values ('aaaaaaaa-0000-4000-8000-000000000001','Έργο Α','{"x":1}')`);
    await as(B, `insert into public.projects (id, name, data) values ('bbbbbbbb-0000-4000-8000-000000000001','Έργο Β','{"x":2}')`);
    const a = await as(A, 'select name, owner_id from public.projects');
    expect(a.rows).toEqual([{ name: 'Έργο Α', owner_id: A }]);
    const b = await as(B, 'select name from public.projects');
    expect(b.rows.map(r => r.name)).toEqual(['Έργο Β']);
  });
  it('δεν μπορεί να αλλάξει ή να διαγράψει έργο άλλου', async () => {
    const u = await as(B, `update public.projects set name='hack' where id='aaaaaaaa-0000-4000-8000-000000000001' returning id`);
    expect(u.rows.length).toBe(0);
    const d = await as(B, `delete from public.projects where id='aaaaaaaa-0000-4000-8000-000000000001' returning id`);
    expect(d.rows.length).toBe(0);
    await expect(as(B, `insert into public.projects (owner_id, name, data) values ('${A}','x','{}')`)).rejects.toThrow();
  });
  it('ο ανώνυμος επισκέπτης δεν βλέπει τίποτα', async () => {
    await db.exec(`set role anon; select set_config('test.uid','',false);`);
    const r = await db.query('select count(*)::int n from public.projects'); await db.exec('reset role;');
    expect(r.rows[0].n).toBe(0);
  });
  it('κρατά ιστορικό: στιγμιότυπο πριν την αλλαγή, το πολύ ένα ανά 10 λεπτά, και πριν τη διαγραφή', async () => {
    const id = 'aaaaaaaa-0000-4000-8000-000000000001';
    await as(A, `update public.projects set data='{"x":10}' where id='${id}'`);
    await as(A, `update public.projects set data='{"x":11}' where id='${id}'`);
    let v = await as(A, `select data, reason from public.project_versions where project_id='${id}' order by id`);
    expect(v.rows).toEqual([{ data: { x: 1 }, reason: 'edit' }]);
    await as(A, `update public.projects set deleted_at=now() where id='${id}'`);
    v = await as(A, `select data, reason from public.project_versions where project_id='${id}' order by id`);
    expect(v.rows.at(-1)).toEqual({ data: { x: 11 }, reason: 'delete' });
    const other = await as(B, `select count(*)::int n from public.project_versions`);
    expect(other.rows[0].n).toBe(0);
    await expect(as(A, `insert into public.project_versions (project_id, owner_id, data) values ('${id}','${A}','{}')`)).rejects.toThrow();
  });
  it('το owner_id δεν αλλάζει', async () => {
    await as(B, `update public.projects set owner_id='${A}' where id='bbbbbbbb-0000-4000-8000-000000000001'`);
    const r = await db.query(`select owner_id from public.projects where id='bbbbbbbb-0000-4000-8000-000000000001'`);
    expect(r.rows[0].owner_id).toBe(B);
  });
  it('ρυθμίσεις ανά χρήστη με upsert', async () => {
    await as(A, `insert into public.settings (eng) values ('{"name":"Ν.Α."}') on conflict (owner_id) do update set eng=excluded.eng`);
    await as(A, `insert into public.settings (eng) values ('{"name":"Νικόλας"}') on conflict (owner_id) do update set eng=excluded.eng`);
    const a = await as(A, 'select eng from public.settings'); expect(a.rows).toEqual([{ eng: { name: 'Νικόλας' } }]);
    const b = await as(B, 'select eng from public.settings'); expect(b.rows).toEqual([]);
  });
});

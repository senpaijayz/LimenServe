import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to PGlite dist/index.js.');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
const migrations = new URL('../../supabase/migrations/', import.meta.url);
const execMigration = async (file) => db.exec(await readFile(new URL(file, migrations), 'utf8'));
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const c = '00000000-0000-4000-8000-000000000003';
const mailbox = '00000000-0000-4000-8000-000000000004';
const mail = 'recovery@example.test';
const query = (sql, args = []) => db.query(sql, args);
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema core; create schema private;
    create table auth.users (id uuid primary key, email text not null, raw_app_meta_data jsonb, banned_until timestamptz);
    create table core.user_profiles (user_id uuid primary key references auth.users on delete cascade, role text);
    create table private.protected_admin_identities (user_id uuid primary key);
    create table private.account_recovery_methods (account_id uuid primary key references auth.users on delete cascade);
  `);
  await execMigration('20261023004434_admin_email_otp_recovery.sql');
  await execMigration('20261126004130_extend_admin_email_code_recovery.sql');
  for (const [id, email, role] of [[a, 'first@example.test', 'admin'], [b, 'second@example.test', 'admin'], [c, 'staff@example.test', 'cashier'], [mailbox, mail, 'customer']]) {
    await query('insert into auth.users values ($1,$2,$3::jsonb,null)', [id, email, JSON.stringify({ role, ...(id === mailbox ? { limen_recovery_only: true } : {}) })]);
    await query('insert into core.user_profiles values ($1,$2)', [id, role]);
  }
  const begin = (id) => query('select public.begin_limen_admin_otp_recovery($1,$2,$3)', [id, mailbox, mail]);
  const complete = async (id) => (await query('select public.complete_limen_admin_otp_recovery($1,$2,$3) as ok', [id, mailbox, mail])).rows[0].ok;
  const lookup = async () => (await query('select * from public.lookup_limen_admin_otp_recovery($1)', [mail])).rows;
  await assert.rejects(begin(c), { code: '42501' });
  await begin(a);
  await assert.rejects(begin(b), { code: '23505' });
  assert.equal(await complete(b), false);
  assert.equal(await complete(a), true);
  assert.equal((await lookup())[0].account_id, a);
  await query('insert into private.account_recovery_methods values ($1)', [a]);
  await query("update auth.users set raw_app_meta_data = '{\"role\":\"cashier\"}' where id=$1", [a]);
  assert.equal((await lookup()).length, 0);
  assert.equal((await query('select * from private.account_recovery_methods')).rows.length, 0);
  await begin(b);
  assert.equal(await complete(b), true);
  assert.equal((await lookup())[0].login_email, 'second@example.test');
  await query('delete from auth.users where id=$1', [b]);
  assert.equal((await lookup()).length, 0);
  assert.equal((await query('select * from private.admin_email_otp_recovery')).rows.length, 0);
  assert.equal((await query('select id from auth.users where id=$1', [mailbox])).rows.length, 1);
  const privileges = await query("select has_function_privilege('authenticated','public.begin_limen_admin_otp_recovery(uuid,uuid,text)','execute') as can_enroll");
  assert.equal(privileges.rows[0].can_enroll, false);
  console.log('PASS: administrator enrollment, consent-code binding, mailbox uniqueness, demotion, deletion, and grants.');
} finally {
  await db.close();
}

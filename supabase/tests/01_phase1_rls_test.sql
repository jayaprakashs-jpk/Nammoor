-- Phase 1 security + integrity tests. Run with: npm run db:test
-- Every block either passes or stops the run (ON_ERROR_STOP).
\set ON_ERROR_STOP on
\set QUIET on

-- ---------- helpers ----------
create table test.ids (k text primary key, v uuid);
grant usage on schema test to authenticated, anon;
grant all on test.ids to authenticated, anon;

create function test.id(p text) returns uuid language sql stable as $$ select v from test.ids where k = p $$;
create function test.put(p text, v uuid) returns void language sql as $$
  insert into test.ids values (p, v) on conflict (k) do update set v = excluded.v $$;

-- Run SQL, demand it fails, and the message contains p_like.
create function test.must_fail(p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not ilike '%' || p_like || '%' then
      raise exception 'Expected error like "%", got "%" for: %', p_like, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'Expected failure but it worked: %', p_sql;
end $$;

-- Run a count query, demand an exact number.
create function test.must_count(p_sql text, p_n bigint, p_why text) returns void language plpgsql as $$
declare n bigint;
begin
  execute p_sql into n;
  if n is distinct from p_n then
    raise exception 'FAIL %: expected %, got % (%)', p_why, p_n, n, p_sql;
  end if;
end $$;
create function test.uid(p_email text) returns uuid language sql stable security definer as $$
  select id from auth.users where email = p_email $$;
grant execute on all functions in schema test to authenticated, anon;

insert into auth.users (id, email, raw_user_meta_data) values
  (gen_random_uuid(), 'alice@x.in',   '{"display_name":"Alice"}'),
  (gen_random_uuid(), 'bob@x.in',     '{"display_name":"Bob"}'),
  (gen_random_uuid(), 'carol@x.in',   '{"display_name":"Carol"}'),
  (gen_random_uuid(), 'mallory@x.in', '{"display_name":"Mallory"}');

\echo '1. sign up creates profiles'
select test.must_count('select count(*) from public.profiles', 4, 'profiles from trigger');

-- =========================================================
\echo '2. anon can read nothing'
set role anon;
select test.must_fail('select * from public.persons', 'permission denied');
select test.must_fail('select public.create_family(''x'')', 'permission denied');
reset role;

-- =========================================================
\echo '3. alice starts a family'
select test.login('alice@x.in');
set role authenticated;
select test.put('fam', public.create_family('Ramasamy Kudumbam', 'Thanjavur', 'Alice', 'female'));
select test.must_count('select count(*) from public.persons', 1, 'owner node created');
select test.must_count('select count(*) from public.chat_rooms where kind = ''family''', 1, 'family room');
select test.must_count('select count(*) from public.chat_room_members', 1, 'owner in room');
select test.put('alice_node', (select id from public.persons where user_id = auth.uid()));

-- direct insert into families is blocked (RPC only)
select test.must_fail('insert into public.families (name, created_by) values (''x'', auth.uid())', 'permission denied');

insert into public.persons (family_id, managed_by, full_name, gender, birth_date, birth_precision)
values (test.id('fam'), auth.uid(), 'Ramasamy', 'male', '1950-01-01', 'year');
select test.put('father', (select id from public.persons where full_name = 'Ramasamy'));
insert into public.persons (family_id, managed_by, full_name, gender)
values (test.id('fam'), auth.uid(), 'Lakshmi', 'female');
select test.put('mother', (select id from public.persons where full_name = 'Lakshmi'));
insert into public.persons (family_id, managed_by, full_name, gender, birth_order)
values (test.id('fam'), auth.uid(), 'Bob', 'male', 2);
select test.put('bob_node', (select id from public.persons where full_name = 'Bob'));
insert into public.persons (family_id, managed_by, full_name, gender)
values (test.id('fam'), auth.uid(), 'Stranger', 'male');
select test.put('stranger', (select id from public.persons where full_name = 'Stranger'));

insert into public.parent_child (family_id, parent_id, child_id) values
  (test.id('fam'), test.id('father'), test.id('alice_node')),
  (test.id('fam'), test.id('mother'), test.id('alice_node')),
  (test.id('fam'), test.id('father'), test.id('bob_node')),
  (test.id('fam'), test.id('mother'), test.id('bob_node'));
insert into public.unions (family_id, partner_a, partner_b, married_on, married_precision)
values (test.id('fam'), test.id('father'), test.id('mother'), '1975-05-10', 'exact');

\echo '4. tree integrity rules'
select test.must_fail(format(
  'insert into public.parent_child (family_id, parent_id, child_id) values (%L, %L, %L)',
  test.id('fam'), test.id('stranger'), test.id('alice_node')), 'at most 2 biological parents');
-- an adoptive third parent is fine
insert into public.parent_child (family_id, parent_id, child_id, kind)
values (test.id('fam'), test.id('stranger'), test.id('alice_node'), 'adopted');
select test.must_fail(format(
  'insert into public.parent_child (family_id, parent_id, child_id) values (%L, %L, %L)',
  test.id('fam'), test.id('alice_node'), test.id('father')), 'own ancestor');
select test.must_fail(format(
  'insert into public.parent_child (family_id, parent_id, child_id) values (%L, %L, %L)',
  test.id('fam'), test.id('father'), test.id('father')), 'check constraint');
select test.must_fail(format(
  'insert into public.unions (family_id, partner_a, partner_b) values (%L, %L, %L)',
  test.id('fam'), test.id('mother'), test.id('father')), 'duplicate key');
select test.must_fail(format(
  'insert into public.unions (family_id, partner_a, partner_b) values (%L, %L, %L)',
  test.id('fam'), test.id('father'), test.id('bob_node')), 'parent and child');
select test.must_fail(format(
  'update public.persons set death_date = ''2020-01-01'' where id = %L', test.id('father')),
  'persons_death_needs_dead');

\echo '5. invites'
select test.put('bob_invite_tok', null);
create temp table tok (k text primary key, t text);
grant all on tok to authenticated;
insert into tok values ('bob', public.create_invite(test.id('fam'), 'editor', test.id('bob_node')));
insert into tok values ('carol', public.create_invite(test.id('fam'), 'viewer', null, 'carol@x.in'));
select test.must_fail(format('select public.create_invite(%L, ''owner'')', test.id('fam')), 'not allowed');
select test.must_count('select count(*) from public.family_invites where token_hash is not null', 2, 'hashed tokens stored');
reset role;

-- mallory: outsider
select test.login('mallory@x.in');
set role authenticated;
\echo '6. outsider sees nothing'
select test.must_count('select count(*) from public.persons', 0, 'outsider persons');
select test.must_count('select count(*) from public.families', 0, 'outsider families');
select test.must_count('select count(*) from public.chat_messages', 0, 'outsider chat');
select test.must_count(format('select jsonb_array_length(public.family_graph(%L) -> ''persons'')', test.id('fam')), 0, 'outsider graph');
select test.must_fail(format(
  'insert into public.persons (family_id, managed_by, full_name) values (%L, auth.uid(), ''Spy'')',
  test.id('fam')), 'row-level security');
select test.must_fail('select public.accept_invite(''deadbeef'')', 'invalid or expired');
-- mallory steals carol's email-locked link
select test.must_fail(format('select public.accept_invite(%L)', (select t from tok where k = 'carol')), 'different email');
reset role;

\echo '7. bob joins and claims his node'
select test.login('bob@x.in');
set role authenticated;
select public.accept_invite((select t from tok where k = 'bob'));
select test.must_count(format('select count(*) from public.persons where id = %L and user_id = auth.uid() and managed_by = auth.uid()', test.id('bob_node')), 1, 'bob claimed node');
select test.must_count('select count(*) from public.chat_room_members where user_id = auth.uid()', 1, 'bob auto-joined family room');
select test.must_count('select count(*) from public.profiles', 2, 'bob sees alice + self');
reset role;
select test.login('mallory@x.in');
set role authenticated;
select test.must_fail(format('select public.accept_invite(%L)', (select t from tok where k = 'bob')), 'invalid or expired');
reset role;

\echo '8. bob edits only his branch'
select test.login('bob@x.in');
set role authenticated;
update public.persons set nickname = 'Bobby' where id = test.id('bob_node');
update public.persons set nickname = 'Hacked' where id = test.id('father');
reset role;
select test.must_count(format('select count(*) from public.persons where id = %L and nickname = ''Bobby''', test.id('bob_node')), 1, 'bob edited self');
select test.must_count(format('select count(*) from public.persons where id = %L and nickname is null', test.id('father')), 1, 'bob could not edit father');
select test.login('bob@x.in');
set role authenticated;
select test.must_fail(format('update public.persons set user_id = auth.uid() where id = %L', test.id('father')), 'permission denied');
select test.must_fail(format('update public.persons set managed_by = %L where id = %L', test.id('father'), test.id('bob_node')), 'only family admins');
select test.must_fail(format('update public.persons set family_id = gen_random_uuid() where id = %L', test.id('bob_node')), 'permission denied');
select test.must_fail(format('select public.create_invite(%L, ''admin'')', test.id('fam')), 'not allowed');
select test.must_fail(format('select public.create_invite(%L, ''editor'', %L)', test.id('fam'), test.id('father')), 'only attach a person you manage');
select length(public.create_invite(test.id('fam'), 'viewer')) = 48 as editor_can_invite_viewer;

-- bob adds his own child and links it
insert into public.persons (family_id, managed_by, full_name, gender, birth_date, birth_precision)
values (test.id('fam'), auth.uid(), 'Bob Junior', 'male', '2015-03-02', 'exact');
select test.put('bob_kid', (select id from public.persons where full_name = 'Bob Junior'));
insert into public.parent_child (family_id, parent_id, child_id) values (test.id('fam'), test.id('bob_node'), test.id('bob_kid'));
select test.must_fail(format(
  'insert into public.persons (family_id, managed_by, full_name) values (%L, %L, ''Fake'')',
  test.id('fam'), test.id('father')), 'row-level security');

\echo '9. salary + DNA privacy'
insert into public.person_private_fields (person_id, family_id, field, value) values
  (test.id('bob_node'), test.id('fam'), 'salary', '{"amount": 900000, "currency": "INR", "period": "year"}'),
  (test.id('bob_node'), test.id('fam'), 'dna', '{"provider": "x", "haplogroup": "R1a"}');
select test.must_count('select count(*) from public.person_private_fields', 2, 'bob sees own private');
reset role;
select test.login('alice@x.in');
set role authenticated;
select test.must_count('select count(*) from public.person_private_fields', 0, 'owner/admin CANNOT see bob salary');
reset role;
select test.login('bob@x.in');
set role authenticated;
insert into public.private_field_grants (person_id, family_id, field, grantee_id)
values (test.id('bob_node'), test.id('fam'), 'salary', (select id from public.profiles where display_name = 'Alice'));
select test.must_fail(format(
  'insert into public.private_field_grants (person_id, family_id, field, grantee_id) values (%L, %L, ''dna'', %L)',
  test.id('bob_node'), test.id('fam'), test.uid('mallory@x.in')), 'row-level security');
reset role;
select test.login('alice@x.in');
set role authenticated;
select test.must_count('select count(*) from public.person_private_fields where field = ''salary''', 1, 'alice sees granted salary');
select test.must_count('select count(*) from public.person_private_fields where field = ''dna''', 0, 'alice still cannot see dna');
select test.must_fail(format(
  'insert into public.person_private_fields (person_id, family_id, field, value) values (%L, %L, ''salary'', ''{}'')',
  test.id('bob_node'), test.id('fam')), 'row-level security');
reset role;

\echo '10. contact visibility'
select test.login('alice@x.in');
set role authenticated;
insert into public.person_contact (person_id, family_id, phone, visibility)
values (test.id('father'), test.id('fam'), '+91 98765 43210', 'private');
reset role;
select test.login('bob@x.in');
set role authenticated;
select test.must_count('select count(*) from public.person_contact', 0, 'private contact hidden from bob');

\echo '11. chat'
insert into public.chat_messages (room_id, body)
values ((select id from public.chat_rooms where kind = 'family'), 'Vanakkam all');
select test.must_fail(format('insert into public.chat_messages (room_id, body, sender_id) values (%L, ''fake'', %L)',
  (select id from public.chat_rooms where kind = 'family'), (select id from public.profiles where display_name = 'Alice')),
  'permission denied');
reset role;
select test.login('alice@x.in');
set role authenticated;
select test.must_count('select count(*) from public.chat_messages', 1, 'alice reads family chat');
select test.must_count('select count(*) from public.chat_rooms where last_message_at is not null', 1, 'room bumped');
update public.chat_messages set body = 'edited by alice';
select test.must_count('select count(*) from public.chat_messages where body = ''edited by alice''', 0, 'cannot edit others msg');
-- private group: alice + bob only
insert into public.chat_rooms (family_id, name) values (test.id('fam'), 'Wedding planning');
insert into public.chat_room_members (room_id, user_id)
select id, auth.uid() from public.chat_rooms where name = 'Wedding planning';
insert into public.chat_room_members (room_id, user_id)
select r.id, p.id from public.chat_rooms r, public.profiles p where r.name = 'Wedding planning' and p.display_name = 'Bob';
select test.must_fail(format('insert into public.chat_room_members (room_id, user_id) values ((select id from public.chat_rooms where name = ''Wedding planning''), %L)',
  test.uid('mallory@x.in')), 'row-level security');
select test.must_fail(format('insert into public.chat_rooms (family_id, name, kind) values (%L, ''x'', ''family'')', test.id('fam')), 'permission denied');
reset role;

\echo '12. carol (viewer) is read only'
select test.login('carol@x.in');
set role authenticated;
select public.accept_invite((select t from tok where k = 'carol'));
select test.must_count('select count(*) from public.persons', 6, 'viewer reads tree');
select test.must_count('select count(*) from public.chat_rooms', 1, 'viewer not in private group');
select test.must_fail(format(
  'insert into public.persons (family_id, managed_by, full_name) values (%L, auth.uid(), ''X'')',
  test.id('fam')), 'row-level security');
select test.must_fail(format('select public.create_invite(%L, ''viewer'')', test.id('fam')), 'not allowed');
reset role;

\echo '13. duplicate merge'
select test.login('alice@x.in');
set role authenticated;
insert into public.persons (family_id, managed_by, full_name, gender, birth_date, birth_precision, birth_place)
values (test.id('fam'), auth.uid(), 'Ramasamy (dup)', 'male', '1950-06-15', 'exact', 'Kumbakonam');
select test.put('father_dup', (select id from public.persons where full_name = 'Ramasamy (dup)'));
insert into public.persons (family_id, managed_by, full_name) values (test.id('fam'), auth.uid(), 'Cousin');
insert into public.parent_child (family_id, parent_id, child_id)
values (test.id('fam'), test.id('father_dup'), (select id from public.persons where full_name = 'Cousin'));
reset role;
select test.login('bob@x.in');
set role authenticated;
insert into public.person_merge_requests (family_id, keep_person_id, drop_person_id, note)
values (test.id('fam'), test.id('father'), test.id('father_dup'), 'Same appa');
select test.must_fail(format('select public.merge_persons((select id from public.person_merge_requests limit 1))'), 'only admins');
reset role;
select test.login('alice@x.in');
set role authenticated;
select public.merge_persons((select id from public.person_merge_requests limit 1));
select test.must_count(format('select count(*) from public.persons where id = %L', test.id('father_dup')), 0, 'dup removed');
select test.must_count(format('select count(*) from public.parent_child where parent_id = %L', test.id('father')), 3, 'father now has 3 kids');
select test.must_count(format('select count(*) from public.persons where id = %L and birth_place = ''Kumbakonam''', test.id('father')), 1, 'blank filled from dup');
select test.must_count(format('select count(*) from public.persons where id = %L and birth_date = ''1950-01-01''', test.id('father')), 1, 'existing dob kept');
select test.must_count('select count(*) from public.person_merge_requests where status = ''approved''', 1, 'request approved');

\echo '14. graph + activity log'
select test.must_count(format('select jsonb_array_length(public.family_graph(%L) -> ''persons'')', test.id('fam')), 7, 'graph persons');
select test.must_count(format('select jsonb_array_length(public.family_graph(%L) -> ''parents'')', test.id('fam')), 7, 'graph edges');
select test.must_count('select count(*) from public.activity_log where entity = ''persons'' and action = ''update''', 3, 'updates logged (claim, nickname, merge)');

\echo '15. ownership guard'
select test.must_fail('delete from public.family_members where user_id = auth.uid()', 'last owner');
update public.family_members set role = 'admin'
 where user_id = (select id from public.profiles where display_name = 'Bob');
reset role;
select test.login('bob@x.in');
set role authenticated;
select test.must_fail(format('update public.family_members set role = ''owner'' where user_id = auth.uid()'), 'row-level security');
delete from public.family_members where user_id = (select id from public.profiles where display_name = 'Alice');
reset role;
select test.must_count('select count(*) from public.family_members where role = ''owner''', 1, 'admin cannot remove owner');

\echo '16. storage paths'
select test.login('bob@x.in');
set role authenticated;
insert into storage.objects (bucket_id, name)
values ('person-photos', test.id('fam') || '/' || test.id('bob_kid') || '/a.webp');
select test.must_fail(format(
  'insert into storage.objects (bucket_id, name) values (''person-photos'', %L)',
  'not-a-uuid/../x.webp'), 'row-level security');
select test.must_fail(format(
  'insert into storage.objects (bucket_id, name) values (''person-photos'', %L)',
  gen_random_uuid() || '/' || test.id('bob_kid') || '/a.webp'), 'row-level security');
reset role;
select test.login('mallory@x.in');
set role authenticated;
select test.must_count('select count(*) from storage.objects', 0, 'outsider cannot list photos');
reset role;

\echo '16b. add_relative + invite_preview'
select test.login('alice@x.in');
set role authenticated;
select test.put('bob_wife', public.add_relative(test.id('bob_node'), 'spouse', '{"full_name":"Priya","gender":"female"}'));
select test.put('bob_kid2', public.add_relative(test.id('bob_node'), 'child', '{"full_name":"Kid Two","birth_date":"2018-01-01"}'));
select test.must_count(format('select count(*) from public.parent_child where child_id = %L', test.id('bob_kid2')), 2, 'child gets both parents');
select test.must_count(format('select count(*) from public.persons where id = %L and birth_precision = ''exact''', test.id('bob_kid2')), 1, 'dob precision defaults to exact');
select test.put('bob_sis', public.add_relative(test.id('bob_node'), 'sibling', '{"full_name":"Sis","gender":"female","birth_order":1}'));
select test.must_count(format('select count(*) from public.parent_child where child_id = %L', test.id('bob_sis')), 2, 'sibling shares parents');
select test.must_fail(format('select public.add_relative(%L, ''father'', ''{"full_name":"X"}'')', test.id('bob_node')), 'already has a father');
select test.must_fail(format('select public.add_relative(%L, ''sibling'', ''{"full_name":"X"}'')', test.id('bob_wife')), 'add a parent first');
select test.must_fail(format('select public.add_relative(%L, ''cousin'', ''{"full_name":"X"}'')', test.id('bob_wife')), 'unknown relation');
select public.add_relative(test.id('bob_wife'), 'father', '{"full_name":"P Appa"}');
select public.add_relative(test.id('bob_wife'), 'mother', '{"full_name":"P Amma"}');
select test.must_count('select count(*) from public.unions u join public.persons a on a.id = u.partner_a join public.persons b on b.id = u.partner_b where a.full_name in (''P Appa'', ''P Amma'') and b.full_name in (''P Appa'', ''P Amma'')', 1, 'parents auto married');
insert into tok values ('preview', public.create_invite(test.id('fam'), 'viewer'));
reset role;
select t as preview_tok from tok where k = 'preview' \gset
select test.login('carol@x.in');
set role authenticated;
select test.must_fail(format('select public.add_relative(%L, ''child'', ''{"full_name":"x"}'')', test.id('bob_node')), 'row-level security');
reset role;
set role anon;
select test.must_count(format('select count(*) from public.invite_preview(%L) where family_name = ''Ramasamy Kudumbam'' and invited_by = ''Alice''', :'preview_tok'), 1, 'anon sees preview with token');
select test.must_count('select count(*) from public.invite_preview(''bad'')', 0, 'bad token gives nothing');
select test.must_fail(format('select public.add_relative(%L, ''child'', ''{"full_name":"x"}'')', test.id('bob_node')), 'permission denied');
reset role;

\echo '17. owner deletes family, everything cascades'
select test.login('alice@x.in');
set role authenticated;
delete from public.families where id = test.id('fam');
reset role;
select test.must_count('select count(*) from public.persons', 0, 'persons gone');
select test.must_count('select count(*) from public.chat_messages', 0, 'chat gone');
select test.must_count('select count(*) from public.activity_log', 0, 'log gone');

\echo 'ALL PHASE 1 DB TESTS PASSED'

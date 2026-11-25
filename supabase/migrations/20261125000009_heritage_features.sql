-- =====================================================================
-- Nammoor :: heritage + family engagement
--   album photos, voice stories, recipes, polls (live counts),
--   AI photo restore limit (3 per family per day), private buckets,
--   Tamil names in the tree data, native place when adding a relative.
-- Every table is scoped by family_id and protected by RLS.
-- =====================================================================

-- who can ADD things (photos, stories, recipes): owners, admins and editors. Viewers only read.
create or replace function app.can_contribute(p_family uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(app.role_in(p_family) in ('owner', 'admin', 'editor'), false)
$$;
revoke all on function app.can_contribute(uuid) from public;
grant execute on function app.can_contribute(uuid) to authenticated;

-- ---------- tree data: Tamil name too (for the poster) ----------
create or replace function public.family_graph(p_family_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'persons', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.full_name, 'nick', p.nickname, 'g', p.gender,
        'dob', p.birth_date, 'dobp', p.birth_precision, 'ord', p.birth_order,
        'alive', p.is_living, 'dod', p.death_date, 'dodp', p.death_precision,
        'photo', p.photo_path, 'uid', p.user_id, 'mgr', p.managed_by,
        'state', p.state_code, 'np', p.native_place, 'nt', p.name_native))
      from public.persons p where p.family_id = p_family_id), '[]'::jsonb),
    'parents', coalesce((select jsonb_agg(jsonb_build_array(pc.parent_id, pc.child_id, pc.kind))
      from public.parent_child pc where pc.family_id = p_family_id), '[]'::jsonb),
    'unions', coalesce((select jsonb_agg(jsonb_build_array(u.partner_a, u.partner_b, u.married_on, u.ended_on, u.end_reason, u.married_precision))
      from public.unions u where u.family_id = p_family_id), '[]'::jsonb)
  )
$$;

-- ---------- add_relative: native place too (for duplicate hints) ----------
create or replace function public.add_relative(p_anchor uuid, p_relation text, p_person jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  a        public.persons;
  new_id   uuid;
  g        public.gender_t;
  dob      date := nullif(p_person ->> 'birth_date', '')::date;
  other    uuid;
  spouse   uuid;
begin
  if p_relation not in ('father', 'mother', 'spouse', 'child', 'sibling') then
    raise exception 'Unknown relation %', p_relation using errcode = '22023';
  end if;
  select * into a from public.persons where id = p_anchor;
  if not found then raise exception 'Person not found' using errcode = 'P0002'; end if;

  g := case p_relation
         when 'father' then 'male'
         when 'mother' then 'female'
         else coalesce(nullif(p_person ->> 'gender', '')::public.gender_t, 'unknown')
       end;

  if p_relation in ('father', 'mother') and exists (
       select 1 from public.parent_child pc join public.persons p on p.id = pc.parent_id
       where pc.child_id = a.id and pc.kind = 'biological' and p.gender = g) then
    raise exception 'This person already has a %', p_relation using errcode = '23505';
  end if;
  if p_relation = 'sibling' and not exists (select 1 from public.parent_child where child_id = a.id) then
    raise exception 'Add a parent first, then add brothers and sisters' using errcode = '22023';
  end if;

  insert into public.persons
    (family_id, managed_by, full_name, gender, birth_date, birth_precision, birth_order, is_living, native_place)
  values
    (a.family_id, auth.uid(), trim(p_person ->> 'full_name'), g, dob,
     coalesce(nullif(p_person ->> 'birth_precision', '')::public.date_precision_t,
              case when dob is null then 'unknown'::public.date_precision_t else 'exact'::public.date_precision_t end),
     nullif(p_person ->> 'birth_order', '')::smallint,
     coalesce((p_person ->> 'is_living')::boolean, true),
     nullif(left(trim(p_person ->> 'native_place'), 120), ''))
  returning id into new_id;

  if p_relation in ('father', 'mother') then
    insert into public.parent_child (family_id, parent_id, child_id) values (a.family_id, new_id, a.id);
    select pc.parent_id into other from public.parent_child pc
     where pc.child_id = a.id and pc.kind = 'biological' and pc.parent_id <> new_id limit 1;
    if other is not null then
      insert into public.unions (family_id, partner_a, partner_b) values (a.family_id, other, new_id) on conflict do nothing;
    end if;
  elsif p_relation = 'spouse' then
    insert into public.unions (family_id, partner_a, partner_b) values (a.family_id, a.id, new_id);
  elsif p_relation = 'child' then
    insert into public.parent_child (family_id, parent_id, child_id) values (a.family_id, a.id, new_id);
    if (select count(*) from public.unions u where (u.partner_a = a.id or u.partner_b = a.id) and u.ended_on is null) = 1 then
      select case when u.partner_a = a.id then u.partner_b else u.partner_a end into spouse
        from public.unions u where (u.partner_a = a.id or u.partner_b = a.id) and u.ended_on is null;
      insert into public.parent_child (family_id, parent_id, child_id) values (a.family_id, spouse, new_id);
    end if;
  else
    insert into public.parent_child (family_id, parent_id, child_id, kind)
    select a.family_id, pc.parent_id, new_id, pc.kind from public.parent_child pc where pc.child_id = a.id;
  end if;
  return new_id;
end $$;

-- =====================================================================
-- ALBUM PHOTOS
-- =====================================================================
create table public.person_photos (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null,
  person_id   uuid not null,
  path        text not null,
  caption     text check (char_length(caption) <= 200),
  year        smallint check (year between 1800 and 2100),
  kind        text not null default 'photo' check (kind in ('photo', 'ai_restored')),
  source_id   uuid references public.person_photos(id) on delete set null,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (family_id, id),
  -- the file must sit in this family's own folder
  check (path like family_id::text || '/%'),
  foreign key (family_id, person_id) references public.persons (family_id, id) on delete cascade
);
create index person_photos_person_idx on public.person_photos (person_id, created_at desc);
create index person_photos_family_idx on public.person_photos (family_id);

-- =====================================================================
-- VOICE STORIES (max 3 minutes)
-- =====================================================================
create table public.voice_memories (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null,
  person_id     uuid not null,
  photo_id      uuid,                       -- null = a story about the person, otherwise about one photo
  audio_path    text not null,
  duration_sec  smallint not null check (duration_sec between 1 and 185),
  title         text check (char_length(title) <= 120),
  author_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  check (audio_path like family_id::text || '/%'),
  foreign key (family_id, person_id) references public.persons (family_id, id) on delete cascade,
  foreign key (family_id, photo_id) references public.person_photos (family_id, id) on delete cascade
);
create index voice_memories_person_idx on public.voice_memories (person_id, created_at);
create index voice_memories_photo_idx on public.voice_memories (photo_id) where photo_id is not null;

-- =====================================================================
-- FAMILY RECIPES (Kudumba Samayal)
-- =====================================================================
create table public.recipes (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  person_id     uuid,                       -- whose recipe it is
  title         text not null check (char_length(title) between 1 and 120),
  title_native  text check (char_length(title_native) <= 120),
  ingredients   text not null default '' check (char_length(ingredients) <= 4000),
  steps         text not null default '' check (char_length(steps) <= 8000),
  photo_path    text,
  created_by    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (photo_path is null or photo_path like family_id::text || '/%'),
  foreign key (family_id, person_id) references public.persons (family_id, id) on delete cascade
);
create index recipes_family_idx on public.recipes (family_id, created_at desc);
create trigger recipes_touch before update on public.recipes for each row execute function app.touch_updated_at();

-- =====================================================================
-- POLLS inside family chat. All writes go through functions.
-- =====================================================================
create table public.polls (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.chat_rooms(id) on delete cascade,
  family_id   uuid not null references public.families(id) on delete cascade,
  question    text not null check (char_length(question) between 1 and 200),
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  closes_at   timestamptz,
  closed_at   timestamptz
);
create index polls_room_idx on public.polls (room_id, created_at desc);

create table public.poll_options (
  id        uuid primary key default gen_random_uuid(),
  poll_id   uuid not null references public.polls(id) on delete cascade,
  label     text not null check (char_length(label) between 1 and 80),
  position  smallint not null,
  votes     int not null default 0 check (votes >= 0),   -- kept up to date by a trigger, so counts are live
  unique (poll_id, id),
  unique (poll_id, position)
);

create table public.poll_votes (
  poll_id   uuid not null,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  option_id uuid not null,
  voted_at  timestamptz not null default now(),
  primary key (poll_id, user_id),                          -- one vote per person
  foreign key (poll_id, option_id) references public.poll_options (poll_id, id) on delete cascade
);

alter table public.chat_messages add column poll_id uuid references public.polls(id) on delete set null;
create index chat_messages_poll_idx on public.chat_messages (poll_id) where poll_id is not null;

create or replace function app.poll_visible(p_poll uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.polls p
                  join public.chat_room_members m on m.room_id = p.room_id and m.user_id = auth.uid()
                 where p.id = p_poll)
$$;
revoke all on function app.poll_visible(uuid) from public;
grant execute on function app.poll_visible(uuid) to authenticated;

create or replace function app.count_poll_votes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.poll_options set votes = greatest(votes - 1, 0) where id = old.option_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.poll_options set votes = votes + 1 where id = new.option_id;
  end if;
  return coalesce(new, old);
end $$;
create trigger poll_votes_count after insert or update of option_id or delete on public.poll_votes
  for each row execute function app.count_poll_votes();

-- ---------- poll functions ----------
create or replace function public.create_poll(p_room_id uuid, p_question text, p_options text[], p_closes_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  fid uuid;
  q text := trim(coalesce(p_question, ''));
  opts text[];
  pid uuid;
  i int;
begin
  if uid is null or not app.is_room_member(p_room_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select family_id into fid from public.chat_rooms where id = p_room_id;
  if char_length(q) not between 1 and 200 then
    raise exception 'Write the question (up to 200 letters)' using errcode = '22023';
  end if;
  -- trim, drop blanks, drop repeats ("Yes" and "yes" are the same choice), keep the order typed
  select array_agg(t order by ord) into opts from (
    select (array_agg(trim(x) order by ord))[1] as t, min(ord) as ord from unnest(coalesce(p_options, '{}')) with ordinality as u(x, ord)
     where trim(x) <> '' group by lower(trim(x))) s;
  if opts is null or cardinality(opts) not between 2 and 5 then
    raise exception 'A poll needs 2 to 5 different choices' using errcode = '22023';
  end if;
  for i in 1..cardinality(opts) loop
    if char_length(opts[i]) > 80 then raise exception 'Each choice can be up to 80 letters' using errcode = '22023'; end if;
  end loop;
  if p_closes_at is not null and (p_closes_at <= now() or p_closes_at > now() + interval '60 days') then
    raise exception 'The closing time must be in the next 60 days' using errcode = '22023';
  end if;

  insert into public.polls (room_id, family_id, question, created_by, closes_at)
  values (p_room_id, fid, q, uid, p_closes_at) returning id into pid;
  for i in 1..cardinality(opts) loop
    insert into public.poll_options (poll_id, label, position) values (pid, opts[i], i);
  end loop;
  insert into public.chat_messages (room_id, sender_id, body, poll_id) values (p_room_id, uid, '📊 ' || q, pid);
  return pid;
end $$;

create or replace function public.vote_poll(p_poll_id uuid, p_option_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  p public.polls;
begin
  select * into p from public.polls where id = p_poll_id;
  if not found or uid is null or not app.is_room_member(p.room_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p.closed_at is not null or (p.closes_at is not null and p.closes_at <= now()) then
    raise exception 'This poll is closed' using errcode = '22023';
  end if;
  if not exists (select 1 from public.poll_options where id = p_option_id and poll_id = p_poll_id) then
    raise exception 'That choice is not in this poll' using errcode = '22023';
  end if;
  insert into public.poll_votes (poll_id, user_id, option_id) values (p_poll_id, uid, p_option_id)
  on conflict (poll_id, user_id) do update set option_id = excluded.option_id, voted_at = now();
end $$;

create or replace function public.close_poll(p_poll_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.polls;
begin
  select * into p from public.polls where id = p_poll_id;
  if not found or not app.is_room_member(p.room_id) or not (p.created_by = auth.uid() or app.is_admin(p.family_id)) then
    raise exception 'Only the person who made the poll, or an admin, can close it' using errcode = '42501';
  end if;
  update public.polls set closed_at = coalesce(closed_at, now()) where id = p_poll_id;
end $$;

-- =====================================================================
-- AI PHOTO RESTORE: at most 3 per family per day (India day)
-- =====================================================================
create table app.ai_restore_log (
  id        bigint generated always as identity primary key,
  family_id uuid not null,
  photo_id  uuid,
  user_id   uuid,
  status    text not null default 'started' check (status in ('started', 'done', 'failed')),
  at        timestamptz not null default now(),
  result_id uuid
);
create index ai_restore_log_family_idx on app.ai_restore_log (family_id, at desc);
alter table app.ai_restore_log enable row level security;
revoke all on app.ai_restore_log from public, anon, authenticated;

create or replace function app.ai_restore_used(p_family uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from app.ai_restore_log
   where family_id = p_family
     and (at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date
     and (status = 'done' or (status = 'started' and at > now() - interval '10 minutes'))  -- a stuck run frees its slot after 10 minutes
$$;

create or replace function public.ai_restore_status(p_family_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare used int;
begin
  if not app.is_member(p_family_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  used := app.ai_restore_used(p_family_id);
  return jsonb_build_object('limit', 3, 'used', used, 'remaining', greatest(3 - used, 0));
end $$;

create or replace function public.ai_restore_begin(p_photo_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ph public.person_photos;
  used int;
  lid bigint;
begin
  select * into ph from public.person_photos where id = p_photo_id;
  if not found or not app.can_contribute(ph.family_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('ai:' || ph.family_id::text));   -- two taps at once cannot both take the last slot
  used := app.ai_restore_used(ph.family_id);
  if used >= 3 then
    return jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'remaining', 0);
  end if;
  insert into app.ai_restore_log (family_id, photo_id, user_id) values (ph.family_id, ph.id, auth.uid()) returning id into lid;
  return jsonb_build_object('allowed', true, 'log_id', lid, 'family_id', ph.family_id, 'person_id', ph.person_id, 'path', ph.path, 'remaining', 3 - used - 1);
end $$;

-- only the Edge Function (service key) closes a run. A failed run gives the slot back.
create or replace function public.ai_restore_finish(p_log_id bigint, p_ok boolean, p_result uuid default null)
returns void language sql security definer set search_path = '' as $$
  update app.ai_restore_log set status = case when p_ok then 'done' else 'failed' end, result_id = p_result where id = p_log_id
$$;

-- =====================================================================
-- PRIVACY: privileges and row level security
-- =====================================================================
revoke all on public.person_photos, public.voice_memories, public.recipes, public.polls, public.poll_options, public.poll_votes from anon, authenticated;

grant select, delete,
      insert (id, family_id, person_id, path, caption, year),
      update (caption, year)
  on public.person_photos to authenticated;
grant select, delete,
      insert (id, family_id, person_id, photo_id, audio_path, duration_sec, title),
      update (title)
  on public.voice_memories to authenticated;
grant select, delete,
      insert (id, family_id, person_id, title, title_native, ingredients, steps, photo_path),
      update (person_id, title, title_native, ingredients, steps, photo_path)
  on public.recipes to authenticated;
grant select on public.polls, public.poll_options to authenticated;
grant select on public.poll_votes to authenticated;           -- you can see only your own vote (policy below)

alter table public.person_photos   enable row level security;
alter table public.voice_memories  enable row level security;
alter table public.recipes         enable row level security;
alter table public.polls           enable row level security;
alter table public.poll_options    enable row level security;
alter table public.poll_votes      enable row level security;

create policy photos_select on public.person_photos for select to authenticated using (app.is_member(family_id));
create policy photos_insert on public.person_photos for insert to authenticated with check (app.can_contribute(family_id) and created_by = (select auth.uid()));
create policy photos_update on public.person_photos for update to authenticated
  using (created_by = (select auth.uid()) or app.is_admin(family_id)) with check (created_by = (select auth.uid()) or app.is_admin(family_id));
create policy photos_delete on public.person_photos for delete to authenticated using (created_by = (select auth.uid()) or app.is_admin(family_id));

create policy memories_select on public.voice_memories for select to authenticated using (app.is_member(family_id));
create policy memories_insert on public.voice_memories for insert to authenticated with check (app.can_contribute(family_id) and author_id = (select auth.uid()));
create policy memories_update on public.voice_memories for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy memories_delete on public.voice_memories for delete to authenticated using (author_id = (select auth.uid()) or app.is_admin(family_id));

create policy recipes_select on public.recipes for select to authenticated using (app.is_member(family_id));
create policy recipes_insert on public.recipes for insert to authenticated with check (app.can_contribute(family_id) and created_by = (select auth.uid()));
create policy recipes_update on public.recipes for update to authenticated
  using (created_by = (select auth.uid()) or app.is_admin(family_id)) with check (created_by = (select auth.uid()) or app.is_admin(family_id));
create policy recipes_delete on public.recipes for delete to authenticated using (created_by = (select auth.uid()) or app.is_admin(family_id));

create policy polls_select on public.polls for select to authenticated using (app.is_room_member(room_id));
create policy poll_options_select on public.poll_options for select to authenticated using (app.poll_visible(poll_id));
create policy poll_votes_select on public.poll_votes for select to authenticated using (user_id = (select auth.uid()));

revoke all on function public.create_poll(uuid, text, text[], timestamptz), public.vote_poll(uuid, uuid), public.close_poll(uuid),
  public.ai_restore_status(uuid), public.ai_restore_begin(uuid), public.ai_restore_finish(bigint, boolean, uuid) from public, anon;
grant execute on function public.create_poll(uuid, text, text[], timestamptz), public.vote_poll(uuid, uuid), public.close_poll(uuid),
  public.ai_restore_status(uuid), public.ai_restore_begin(uuid) to authenticated;
revoke execute on function public.ai_restore_finish(bigint, boolean, uuid) from authenticated;
grant execute on function public.ai_restore_finish(bigint, boolean, uuid) to service_role;

-- =====================================================================
-- STORAGE: private buckets, family folder = first path part
--   family-audio  {family_id}/{person_id}/{id}.aac|webm|m4a      voice stories
--   family-album  {family_id}/{person_id}/{id}.webp|jpg          album photos
--                 {family_id}/recipes/{id}.webp                   recipe photos
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-audio', 'family-audio', false, 6291456,
        array['audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/ogg', 'audio/mpeg'])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-album', 'family-album', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

do $$
declare b text;
begin
  foreach b in array array['family-audio', 'family-album'] loop
    execute format($p$create policy %I on storage.objects for select to authenticated
      using (bucket_id = %L and app.is_member(app.try_uuid((storage.foldername(name))[1])))$p$, b || '_read', b);
    execute format($p$create policy %I on storage.objects for insert to authenticated
      with check (bucket_id = %L and app.can_contribute(app.try_uuid((storage.foldername(name))[1])))$p$, b || '_write', b);
    execute format($p$create policy %I on storage.objects for delete to authenticated
      using (bucket_id = %L and (owner = (select auth.uid()) or app.is_admin(app.try_uuid((storage.foldername(name))[1]))))$p$, b || '_delete', b);
  end loop;
end $$;

-- live poll counts (RLS still decides who receives each change)
alter publication supabase_realtime add table public.poll_options;
alter publication supabase_realtime add table public.polls;

-- =====================================================================
-- Nammoor :: Phase 1 core schema
-- Family tree, profiles, privacy, invites, merges, family chat.
--
-- Design rules
--  1. A "person" is a node in the tree. A "profile" is a login account.
--     Most persons (grandparents, kids, the dead) will never log in.
--     A user "claims" one person node per family through an invite.
--  2. Relationships are edges (parent_child, unions). Spouse, children,
--     siblings, age and every relationship title are DERIVED, never stored.
--  3. Salary and DNA live in their own table, one row per field, so RLS
--     can hide them per field. Family admins can NOT see them.
--  4. Security lives in Postgres (RLS + column grants + RPCs).
--     The app is a static export, so there is no trusted server in between.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Private schema for helpers. Not exposed through the Supabase API.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.gender_t         as enum ('male', 'female', 'other', 'unknown');
create type public.date_precision_t as enum ('exact', 'month', 'year', 'approx', 'unknown');
create type public.family_role_t    as enum ('owner', 'admin', 'editor', 'viewer');
create type public.parent_kind_t    as enum ('biological', 'adopted', 'step', 'foster');
create type public.union_end_t      as enum ('divorce', 'death', 'separation');
create type public.visibility_t     as enum ('family', 'private');
create type public.private_field_t  as enum ('salary', 'dna');
create type public.merge_status_t   as enum ('pending', 'approved', 'rejected');
create type public.chat_room_kind_t as enum ('family', 'group');
create type public.relation_style_t as enum ('tamil', 'english_in', 'english_global');

-- ---------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Safe text -> uuid cast (used by storage policies on user supplied paths).
create or replace function app.try_uuid(p text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- =====================================================================
-- TABLES
-- =====================================================================

-- Login accounts. 1:1 with auth.users, created by trigger on sign up.
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text not null default '' check (char_length(display_name) <= 80),
  phone           text check (phone ~ '^\+?[0-9 ]{6,20}$'),
  avatar_path     text,
  ui_language     text not null default 'en' check (ui_language in ('en', 'ta')),
  relation_style  public.relation_style_t not null default 'english_in',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One shared family tree.
create table public.families (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 120),
  native_place  text check (char_length(native_place) <= 120),   -- "oor"
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Who can open which tree, and with what power.
create table public.family_members (
  family_id   uuid not null references public.families(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        public.family_role_t not null default 'viewer',
  invited_by  uuid references public.profiles(id) on delete set null,
  joined_at   timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index family_members_user_idx on public.family_members (user_id);

-- Tree nodes.
create table public.persons (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families(id) on delete cascade,
  user_id          uuid references public.profiles(id) on delete set null,  -- claimed account
  managed_by       uuid references public.profiles(id) on delete set null,  -- branch keeper
  -- Names. Tamil names often have no surname, just father's initial.
  full_name        text not null check (char_length(full_name) between 1 and 120),
  initials         text check (char_length(initials) <= 12),
  nickname         text check (char_length(nickname) <= 60),
  name_native      text check (char_length(name_native) <= 120),     -- Tamil script etc.
  gender           public.gender_t not null default 'unknown',
  -- Birth. Many elders only know the year, so precision is stored.
  birth_date       date,
  birth_precision  public.date_precision_t not null default 'unknown',
  birth_time       time,          -- needed for Jathagam in Phase 3
  birth_place      text check (char_length(birth_place) <= 120),
  -- Elder / younger decides Periyappa vs Chithappa, Anna vs Thambi.
  -- Used when DOBs are missing. 1 = eldest among siblings.
  birth_order      smallint check (birth_order between 1 and 30),
  is_living        boolean not null default true,
  death_date       date,
  death_precision  public.date_precision_t not null default 'unknown',
  -- Place. state_code drives regional relation terms (ISO 3166-2, e.g. IN-TN).
  native_place     text check (char_length(native_place) <= 120),
  current_city     text check (char_length(current_city) <= 120),
  state_code       text check (state_code ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'),
  country_code     text check (country_code ~ '^[A-Z]{2}$'),
  photo_path       text,
  history          text check (char_length(history) <= 5000),       -- family history / notes
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint persons_family_id_key unique (family_id, id),            -- target of composite FKs
  constraint persons_death_needs_dead check (death_date is null or not is_living),
  constraint persons_death_after_birth check (
    death_date is null or birth_date is null or death_date >= birth_date)
);
create index persons_family_idx on public.persons (family_id);
create unique index persons_one_node_per_user
  on public.persons (family_id, user_id) where user_id is not null;
create index persons_user_idx on public.persons (user_id) where user_id is not null;
create index persons_managed_by_idx on public.persons (managed_by);

-- Contact + street address. Can be hidden from the family.
create table public.person_contact (
  person_id     uuid primary key,
  family_id     uuid not null,
  phone         text check (phone ~ '^\+?[0-9 ]{6,20}$'),
  email         text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address_line  text check (char_length(address_line) <= 300),
  postal_code   text check (char_length(postal_code) <= 12),
  visibility    public.visibility_t not null default 'family',
  updated_at    timestamptz not null default now(),
  foreign key (family_id, person_id) references public.persons (family_id, id) on delete cascade
);

create table public.person_education (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null,
  family_id       uuid not null,
  level           text not null check (level in
                    ('school', 'diploma', 'iti', 'ug', 'pg', 'doctorate', 'other')),
  course          text check (char_length(course) <= 120),
  institution     text check (char_length(institution) <= 160),
  year_completed  smallint check (year_completed between 1900 and 2100),
  created_at      timestamptz not null default now(),
  foreign key (family_id, person_id) references public.persons (family_id, id) on delete cascade
);
create index person_education_person_idx on public.person_education (person_id);

create table public.person_occupations (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null,
  family_id     uuid not null,
  title         text not null check (char_length(title) between 1 and 120),
  organization  text check (char_length(organization) <= 160),
  city          text check (char_length(city) <= 120),
  is_current    boolean not null default true,
  start_year    smallint check (start_year between 1900 and 2100),
  end_year      smallint check (end_year between 1900 and 2100),
  created_at    timestamptz not null default now(),
  check (end_year is null or start_year is null or end_year >= start_year),
  foreign key (family_id, person_id) references public.persons (family_id, id) on delete cascade
);
create index person_occupations_person_idx on public.person_occupations (person_id);

-- Salary and DNA. One row per field so RLS can hide each one on its own.
-- value shapes:
--   salary: {"amount": 600000, "currency": "INR", "period": "year"}
--   dna:    {"provider": "...", "haplogroup": "...", "kit_ref": "..."}
-- No raw genome files. Ever.
create table public.person_private_fields (
  person_id   uuid not null,
  family_id   uuid not null,
  field       public.private_field_t not null,
  value       jsonb not null check (jsonb_typeof(value) = 'object'),
  updated_at  timestamptz not null default now(),
  primary key (person_id, field),
  foreign key (family_id, person_id) references public.persons (family_id, id) on delete cascade
);

-- Who the owner chose to show a private field to.
create table public.private_field_grants (
  person_id   uuid not null,
  family_id   uuid not null,
  field       public.private_field_t not null,
  grantee_id  uuid not null references public.profiles(id) on delete cascade,
  granted_by  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (person_id, field, grantee_id),
  foreign key (family_id, person_id) references public.persons (family_id, id) on delete cascade
);
create index private_field_grants_grantee_idx on public.private_field_grants (grantee_id);

-- Parent -> child edges. Both ends must be in the same family (composite FK).
create table public.parent_child (
  family_id   uuid not null,
  parent_id   uuid not null,
  child_id    uuid not null,
  kind        public.parent_kind_t not null default 'biological',
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (parent_id, child_id),
  check (parent_id <> child_id),
  foreign key (family_id, parent_id) references public.persons (family_id, id) on delete cascade,
  foreign key (family_id, child_id)  references public.persons (family_id, id) on delete cascade
);
create index parent_child_child_idx on public.parent_child (child_id);
create index parent_child_family_idx on public.parent_child (family_id);

-- Marriages. No monogamy rule on purpose: older generations had it,
-- and remarriage after death or divorce is common.
create table public.unions (
  id                 uuid primary key default gen_random_uuid(),
  family_id          uuid not null,
  partner_a          uuid not null,
  partner_b          uuid not null,
  married_on         date,
  married_precision  public.date_precision_t not null default 'unknown',
  ended_on           date,
  end_reason         public.union_end_t,
  created_by         uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  check (partner_a <> partner_b),
  check (ended_on is null or end_reason is not null),
  check (ended_on is null or married_on is null or ended_on >= married_on),
  foreign key (family_id, partner_a) references public.persons (family_id, id) on delete cascade,
  foreign key (family_id, partner_b) references public.persons (family_id, id) on delete cascade
);
create unique index unions_pair_key on public.unions
  (least(partner_a, partner_b), greatest(partner_a, partner_b));
create index unions_family_idx on public.unions (family_id);
create index unions_partner_b_idx on public.unions (partner_b);

-- Invite links. Only the SHA-256 of the token is stored.
create table public.family_invites (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families(id) on delete cascade,
  token_hash       bytea not null unique,
  email            text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role             public.family_role_t not null default 'editor' check (role <> 'owner'),
  claim_person_id  uuid,  -- "you are this node in the tree"
  created_by       uuid not null references public.profiles(id) on delete cascade,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '7 days',
  max_uses         int not null default 1 check (max_uses between 1 and 100),
  use_count        int not null default 0,
  revoked_at       timestamptz,
  foreign key (family_id, claim_person_id) references public.persons (family_id, id) on delete cascade
);
create index family_invites_family_idx on public.family_invites (family_id);

-- Two branches added the same grandpa. Someone asks, an admin decides.
create table public.person_merge_requests (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
 -- Nullable: after a merge the dropped node is gone, but the record stays.
  keep_person_id  uuid,
  drop_person_id  uuid,
  drop_snapshot   jsonb,          -- copy of the dropped node, for undo by hand
  note            text check (char_length(note) <= 500),
  status          public.merge_status_t not null default 'pending',
  requested_by    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  decided_by      uuid references public.profiles(id) on delete set null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  check (keep_person_id <> drop_person_id),
  foreign key (family_id, keep_person_id) references public.persons (family_id, id)
    on delete set null (keep_person_id),
  foreign key (family_id, drop_person_id) references public.persons (family_id, id)
    on delete set null (drop_person_id)
);
create index person_merge_requests_family_idx on public.person_merge_requests (family_id, status);

-- Chat.
create table public.chat_rooms (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families(id) on delete cascade,
  kind             public.chat_room_kind_t not null default 'group',
  name             text not null check (char_length(name) between 1 and 80),
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz
);
create unique index chat_rooms_one_family_room on public.chat_rooms (family_id) where kind = 'family';

create table public.chat_room_members (
  room_id       uuid not null references public.chat_rooms(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  joined_at     timestamptz not null default now(),
  last_read_at  timestamptz,
  muted         boolean not null default false,
  primary key (room_id, user_id)
);
create index chat_room_members_user_idx on public.chat_room_members (user_id);

create table public.chat_messages (
  id               uuid primary key default gen_random_uuid(),  -- client may send its own id
  room_id          uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body             text check (char_length(body) between 1 and 4000),
  attachment_path  text,
  reply_to         uuid references public.chat_messages(id) on delete set null,
  created_at       timestamptz not null default now(),
  edited_at        timestamptz,
  deleted_at       timestamptz,
  check (body is not null or attachment_path is not null or deleted_at is not null)
);
create index chat_messages_room_time_idx on public.chat_messages (room_id, created_at desc);

-- Who changed what. Family fights about "who edited grandpa's DOB" are real.
create table public.activity_log (
  id          bigint generated always as identity primary key,
  family_id   uuid not null references public.families(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,      -- insert / update / delete
  entity      text not null,      -- table name
  entity_id   text not null,
  diff        jsonb,
  created_at  timestamptz not null default now()
);
create index activity_log_family_time_idx on public.activity_log (family_id, created_at desc);

-- =====================================================================
-- ACCESS HELPERS (security definer, so they skip RLS and can't recurse)
-- =====================================================================

create or replace function app.role_in(p_family uuid)
returns public.family_role_t language sql stable security definer set search_path = '' as $$
  select m.role from public.family_members m
  where m.family_id = p_family and m.user_id = auth.uid()
$$;

create or replace function app.is_member(p_family uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.family_members m
                 where m.family_id = p_family and m.user_id = auth.uid())
$$;

create or replace function app.is_admin(p_family uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(app.role_in(p_family) in ('owner', 'admin'), false)
$$;

-- Admins edit anyone. Editors edit the nodes they keep, plus their own node.
create or replace function app.can_edit_person(p_person uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.persons p
    join public.family_members m
      on m.family_id = p.family_id and m.user_id = auth.uid()
    where p.id = p_person
      and ( m.role in ('owner', 'admin')
         or (m.role = 'editor' and (p.managed_by = auth.uid() or p.user_id = auth.uid())) )
  )
$$;

-- Private data owner = the person themself if they claimed the node,
-- otherwise the branch keeper (for kids, elders, the dead).
create or replace function app.owns_private(p_person uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.persons p
    where p.id = p_person
      and ( p.user_id = auth.uid()
         or (p.user_id is null and p.managed_by = auth.uid()) )
      and app.is_member(p.family_id)
  )
$$;

create or replace function app.is_room_member(p_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_room_members r
                 where r.room_id = p_room and r.user_id = auth.uid())
$$;

-- Do two users share at least one family? (for reading each other's profile)
create or replace function app.shares_family(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_members a
    join public.family_members b on b.family_id = a.family_id
    where a.user_id = auth.uid() and b.user_id = p_user)
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated;

-- =====================================================================
-- TRIGGERS
-- =====================================================================

create trigger profiles_touch   before update on public.profiles       for each row execute function app.touch_updated_at();
create trigger families_touch   before update on public.families       for each row execute function app.touch_updated_at();
create trigger persons_touch    before update on public.persons        for each row execute function app.touch_updated_at();
create trigger contact_touch    before update on public.person_contact for each row execute function app.touch_updated_at();
create trigger private_touch    before update on public.person_private_fields for each row execute function app.touch_updated_at();

-- New auth user -> profile row.
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'display_name', 80), ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- Only admins can hand a node to another keeper.
create or replace function app.guard_person_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.managed_by is distinct from old.managed_by
     and auth.uid() is not null
     and coalesce(current_setting('app.trusted_rpc', true), '') <> 'on'
     and not app.is_admin(old.family_id) then
    raise exception 'Only family admins can change who manages a person'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger persons_guard before update on public.persons
  for each row execute function app.guard_person_update();

-- Parent edge rules: no loops, max 2 biological parents.
create or replace function app.validate_parent_child()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  bio_count int;
begin
  -- Lock the child so two parallel inserts can't both pass the count check.
  perform 1 from public.persons where id = new.child_id for update;

  if new.kind = 'biological' then
    select count(*) into bio_count from public.parent_child
    where child_id = new.child_id and kind = 'biological'
      and parent_id <> new.parent_id;
    if bio_count >= 2 then
      raise exception 'A person can have at most 2 biological parents'
        using errcode = '23514';
    end if;
  end if;

  -- Is the new child already an ancestor of the new parent? Then it's a loop.
  if exists (
    with recursive anc(id) as (
      select pc.parent_id from public.parent_child pc where pc.child_id = new.parent_id
      union
      select pc.parent_id from public.parent_child pc join anc on pc.child_id = anc.id
    )
    select 1 from anc where id = new.child_id
  ) then
    raise exception 'This link would make someone their own ancestor'
      using errcode = '23514';
  end if;

  return new;
end $$;
create trigger parent_child_validate before insert or update on public.parent_child
  for each row execute function app.validate_parent_child();

-- Can't marry your own parent or child.
create or replace function app.validate_union()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.parent_child
             where (parent_id = new.partner_a and child_id = new.partner_b)
                or (parent_id = new.partner_b and child_id = new.partner_a)) then
    raise exception 'A parent and child cannot be partners' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger unions_validate before insert or update on public.unions
  for each row execute function app.validate_union();

-- Every family gets one family-wide chat room.
create or replace function app.create_family_room()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.chat_rooms (family_id, kind, name, created_by)
  values (new.id, 'family', new.name, new.created_by);
  return new;
end $$;
create trigger families_room after insert on public.families
  for each row execute function app.create_family_room();

-- Join family -> join family room. Leave family -> leave all its rooms.
create or replace function app.sync_room_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.chat_room_members (room_id, user_id)
    select r.id, new.user_id from public.chat_rooms r
    where r.family_id = new.family_id and r.kind = 'family'
    on conflict do nothing;
    return new;
  else
    delete from public.chat_room_members crm
    using public.chat_rooms r
    where crm.room_id = r.id and r.family_id = old.family_id and crm.user_id = old.user_id;
    return old;
  end if;
end $$;
create trigger family_members_rooms after insert or delete on public.family_members
  for each row execute function app.sync_room_membership();

-- A family must always keep at least one owner.
create or replace function app.guard_last_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.families f where f.id = old.family_id) -- skip on family delete cascade
     and not exists (select 1 from public.family_members
                     where family_id = old.family_id and role = 'owner'
                       and user_id <> old.user_id) then
    raise exception 'Transfer ownership before removing the last owner'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger family_members_owner_guard before update or delete on public.family_members
  for each row execute function app.guard_last_owner();

create or replace function app.bump_room_time()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.chat_rooms set last_message_at = new.created_at where id = new.room_id;
  return new;
end $$;
create trigger chat_messages_bump after insert on public.chat_messages
  for each row execute function app.bump_room_time();

-- Activity log for tree edits.
create or replace function app.log_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r   jsonb := to_jsonb(coalesce(new, old));
  fid uuid  := (r ->> 'family_id')::uuid;
  eid text  := coalesce(r ->> 'id', (r ->> 'parent_id') || ':' || (r ->> 'child_id'));
  d   jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into d
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key not in ('updated_at');
    if d is null then return new; end if;
  elsif tg_op = 'DELETE' then
    d := r;
  end if;
  -- On family delete the family row is already gone, nothing to log into.
  if exists (select 1 from public.families where id = fid) then
    insert into public.activity_log (family_id, actor_id, action, entity, entity_id, diff)
    values (fid, auth.uid(), lower(tg_op), tg_table_name, eid, d);
  end if;
  return coalesce(new, old);
end $$;
create trigger persons_log      after insert or update or delete on public.persons      for each row execute function app.log_activity();
create trigger parent_child_log after insert or update or delete on public.parent_child for each row execute function app.log_activity();
create trigger unions_log       after insert or update or delete on public.unions       for each row execute function app.log_activity();

-- =====================================================================
-- PRIVILEGES. Default Supabase grants are wide open; close them first,
-- then grant only what the app needs. Column grants stop clients from
-- rewriting ownership columns (family_id, user_id, created_by ...).
-- =====================================================================

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select, update (display_name, phone, avatar_path, ui_language, relation_style)
  on public.profiles to authenticated;

grant select, update (name, native_place), delete on public.families to authenticated;

grant select, update (role), delete on public.family_members to authenticated;

grant select, delete on public.persons to authenticated;
grant insert (id, family_id, managed_by, full_name, initials, nickname, name_native, gender,
              birth_date, birth_precision, birth_time, birth_place, birth_order,
              is_living, death_date, death_precision, native_place, current_city,
              state_code, country_code, photo_path, history)
  on public.persons to authenticated;
grant update (managed_by, full_name, initials, nickname, name_native, gender,
              birth_date, birth_precision, birth_time, birth_place, birth_order,
              is_living, death_date, death_precision, native_place, current_city,
              state_code, country_code, photo_path, history)
  on public.persons to authenticated;

grant select, delete,
      insert (person_id, family_id, phone, email, address_line, postal_code, visibility),
      update (phone, email, address_line, postal_code, visibility)
  on public.person_contact to authenticated;

grant select, delete,
      insert (id, person_id, family_id, level, course, institution, year_completed),
      update (level, course, institution, year_completed)
  on public.person_education to authenticated;

grant select, delete,
      insert (id, person_id, family_id, title, organization, city, is_current, start_year, end_year),
      update (title, organization, city, is_current, start_year, end_year)
  on public.person_occupations to authenticated;

grant select, delete, insert (person_id, family_id, field, value), update (value)
  on public.person_private_fields to authenticated;

grant select, delete, insert (person_id, family_id, field, grantee_id)
  on public.private_field_grants to authenticated;

grant select, delete, insert (family_id, parent_id, child_id, kind), update (kind)
  on public.parent_child to authenticated;

grant select, delete,
      insert (id, family_id, partner_a, partner_b, married_on, married_precision, ended_on, end_reason),
      update (married_on, married_precision, ended_on, end_reason)
  on public.unions to authenticated;

grant select, update (revoked_at) on public.family_invites to authenticated;

grant select, insert (family_id, keep_person_id, drop_person_id, note)
  on public.person_merge_requests to authenticated;
grant update (status) on public.person_merge_requests to authenticated;

grant select, insert (id, family_id, name), update (name), delete on public.chat_rooms to authenticated;
grant select, insert (room_id, user_id), update (last_read_at, muted), delete
  on public.chat_room_members to authenticated;
grant select, insert (id, room_id, body, attachment_path, reply_to),
      update (body, edited_at, deleted_at)
  on public.chat_messages to authenticated;

grant select on public.activity_log to authenticated;

-- =====================================================================
-- ROW LEVEL SECURITY
-- (select auth.uid()) is wrapped so Postgres runs it once per query.
-- =====================================================================

alter table public.profiles               enable row level security;
alter table public.families               enable row level security;
alter table public.family_members         enable row level security;
alter table public.persons                enable row level security;
alter table public.person_contact         enable row level security;
alter table public.person_education       enable row level security;
alter table public.person_occupations     enable row level security;
alter table public.person_private_fields  enable row level security;
alter table public.private_field_grants   enable row level security;
alter table public.parent_child           enable row level security;
alter table public.unions                 enable row level security;
alter table public.family_invites         enable row level security;
alter table public.person_merge_requests  enable row level security;
alter table public.chat_rooms             enable row level security;
alter table public.chat_room_members      enable row level security;
alter table public.chat_messages          enable row level security;
alter table public.activity_log           enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or app.shares_family(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- families (insert only through create_family RPC)
create policy families_select on public.families for select to authenticated
  using (app.is_member(id));
create policy families_update on public.families for update to authenticated
  using (app.is_admin(id)) with check (app.is_admin(id));
create policy families_delete on public.families for delete to authenticated
  using (app.role_in(id) = 'owner');

-- family_members (insert only through RPCs)
create policy members_select on public.family_members for select to authenticated
  using (app.is_member(family_id));
create policy members_update on public.family_members for update to authenticated
  using (app.is_admin(family_id))
  with check (app.is_admin(family_id)
              and (role <> 'owner' or app.role_in(family_id) = 'owner'));
create policy members_delete on public.family_members for delete to authenticated
  using (user_id = (select auth.uid())                      -- leave
      or (app.is_admin(family_id) and role <> 'owner'));    -- remove someone

-- persons
create policy persons_select on public.persons for select to authenticated
  using (app.is_member(family_id));
create policy persons_insert on public.persons for insert to authenticated
  with check (app.role_in(family_id) in ('owner', 'admin', 'editor')
              and (managed_by = (select auth.uid()) or app.is_admin(family_id)));
create policy persons_update on public.persons for update to authenticated
  using (app.can_edit_person(id)) with check (app.is_member(family_id));
create policy persons_delete on public.persons for delete to authenticated
  using (app.is_admin(family_id)
      or (managed_by = (select auth.uid()) and user_id is null
          and app.role_in(family_id) = 'editor'));

-- person_contact
create policy contact_select on public.person_contact for select to authenticated
  using (app.is_member(family_id)
         and (visibility = 'family' or app.can_edit_person(person_id)));
create policy contact_write on public.person_contact for all to authenticated
  using (app.can_edit_person(person_id)) with check (app.can_edit_person(person_id));

-- education / occupations
create policy education_select on public.person_education for select to authenticated
  using (app.is_member(family_id));
create policy education_write on public.person_education for all to authenticated
  using (app.can_edit_person(person_id)) with check (app.can_edit_person(person_id));
create policy occupations_select on public.person_occupations for select to authenticated
  using (app.is_member(family_id));
create policy occupations_write on public.person_occupations for all to authenticated
  using (app.can_edit_person(person_id)) with check (app.can_edit_person(person_id));

-- private fields: owner, or someone the owner granted. Admins get nothing.
create policy private_select on public.person_private_fields for select to authenticated
  using (app.owns_private(person_id)
      or exists (select 1 from public.private_field_grants g
                 where g.person_id = person_private_fields.person_id
                   and g.field = person_private_fields.field
                   and g.grantee_id = (select auth.uid())));
create policy private_write on public.person_private_fields for all to authenticated
  using (app.owns_private(person_id)) with check (app.owns_private(person_id));

create policy grants_select on public.private_field_grants for select to authenticated
  using (app.owns_private(person_id) or grantee_id = (select auth.uid()));
create policy grants_insert on public.private_field_grants for insert to authenticated
  with check (app.owns_private(person_id)
              and exists (select 1 from public.family_members m
                          where m.family_id = private_field_grants.family_id
                            and m.user_id = grantee_id));
create policy grants_delete on public.private_field_grants for delete to authenticated
  using (app.owns_private(person_id));

-- parent_child / unions: edit if you can edit either end.
create policy pc_select on public.parent_child for select to authenticated
  using (app.is_member(family_id));
create policy pc_write on public.parent_child for all to authenticated
  using (app.can_edit_person(parent_id) or app.can_edit_person(child_id))
  with check (app.can_edit_person(parent_id) or app.can_edit_person(child_id));

create policy unions_select on public.unions for select to authenticated
  using (app.is_member(family_id));
create policy unions_write on public.unions for all to authenticated
  using (app.can_edit_person(partner_a) or app.can_edit_person(partner_b))
  with check (app.can_edit_person(partner_a) or app.can_edit_person(partner_b));

-- invites: inviter and admins can see and revoke. Create through RPC only.
create policy invites_select on public.family_invites for select to authenticated
  using (app.is_admin(family_id) or created_by = (select auth.uid()));
create policy invites_update on public.family_invites for update to authenticated
  using (app.is_admin(family_id) or created_by = (select auth.uid()))
  with check (app.is_admin(family_id) or created_by = (select auth.uid()));

-- merge requests
create policy merge_select on public.person_merge_requests for select to authenticated
  using (app.is_member(family_id));
create policy merge_insert on public.person_merge_requests for insert to authenticated
  with check (app.role_in(family_id) in ('owner', 'admin', 'editor')
              and requested_by = (select auth.uid()) and status = 'pending'
              and keep_person_id is not null and drop_person_id is not null);
create policy merge_reject on public.person_merge_requests for update to authenticated
  using (app.is_admin(family_id) and status = 'pending')
  with check (status = 'rejected');   -- approve goes through merge_persons()

-- chat
create policy rooms_select on public.chat_rooms for select to authenticated
  using (app.is_room_member(id));
create policy rooms_insert on public.chat_rooms for insert to authenticated
  with check (app.is_member(family_id) and kind = 'group');
create policy rooms_update on public.chat_rooms for update to authenticated
  using (created_by = (select auth.uid()) or app.is_admin(family_id))
  with check (created_by = (select auth.uid()) or app.is_admin(family_id));
create policy rooms_delete on public.chat_rooms for delete to authenticated
  using (kind = 'group' and (created_by = (select auth.uid()) or app.is_admin(family_id)));

create policy room_members_select on public.chat_room_members for select to authenticated
  using (app.is_room_member(room_id));
-- Room creator adds people, and only people from the same family.
create policy room_members_insert on public.chat_room_members for insert to authenticated
  with check (exists (
    select 1 from public.chat_rooms r
    join public.family_members m on m.family_id = r.family_id and m.user_id = chat_room_members.user_id
    where r.id = room_id and r.kind = 'group'
      and (r.created_by = (select auth.uid()) or app.is_admin(r.family_id))));
create policy room_members_update on public.chat_room_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy room_members_delete on public.chat_room_members for delete to authenticated
  using (user_id = (select auth.uid())
      or exists (select 1 from public.chat_rooms r
                 where r.id = room_id and r.kind = 'group'
                   and (r.created_by = (select auth.uid()) or app.is_admin(r.family_id))));

create policy messages_select on public.chat_messages for select to authenticated
  using (app.is_room_member(room_id));
create policy messages_insert on public.chat_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and app.is_room_member(room_id));
create policy messages_update on public.chat_messages for update to authenticated
  using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));

create policy activity_select on public.activity_log for select to authenticated
  using (app.is_member(family_id));

-- =====================================================================
-- RPCs (callable from the app via supabase.rpc)
-- =====================================================================

-- Start a new tree. Creates family, owner membership, your own node, chat room.
create or replace function public.create_family(
  p_name text, p_native_place text default null,
  p_self_name text default null, p_self_gender public.gender_t default 'unknown')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  fid uuid;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;

  insert into public.families (name, native_place, created_by)
  values (p_name, p_native_place, uid) returning id into fid;

  insert into public.family_members (family_id, user_id, role) values (fid, uid, 'owner');

  insert into public.persons (family_id, user_id, managed_by, created_by, full_name, gender)
  values (fid, uid, uid, uid,
          coalesce(nullif(trim(p_self_name), ''),
                   nullif((select display_name from public.profiles where id = uid), ''),
                   'Me'),
          p_self_gender);
  return fid;
end $$;

-- Make an invite link. Returns the raw token ONCE. Only its hash is stored.
-- Admins invite any role (not owner). Editors invite editors/viewers,
-- and can only attach a node they manage.
create or replace function public.create_invite(
  p_family_id uuid, p_role public.family_role_t default 'editor',
  p_claim_person_id uuid default null, p_email text default null,
  p_valid_days int default 7, p_max_uses int default 1)
returns text language plpgsql security definer set search_path = '' as $$
declare
  my_role public.family_role_t := app.role_in(p_family_id);
  tok text;
begin
  if my_role is null or my_role = 'viewer' then
    raise exception 'Not allowed to invite' using errcode = '42501';
  end if;
  if p_role = 'owner' or (my_role = 'editor' and p_role = 'admin') then
    raise exception 'Not allowed to give that role' using errcode = '42501';
  end if;
  if p_claim_person_id is not null then
    if not app.can_edit_person(p_claim_person_id) then
      raise exception 'You can only attach a person you manage' using errcode = '42501';
    end if;
    if exists (select 1 from public.persons where id = p_claim_person_id and user_id is not null) then
      raise exception 'That person already has an account' using errcode = '23505';
    end if;
    if p_max_uses <> 1 then
      raise exception 'A claim invite must be single use' using errcode = '22023';
    end if;
  end if;
  if p_valid_days not between 1 and 30 then
    raise exception 'Invite must be valid 1 to 30 days' using errcode = '22023';
  end if;

  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.family_invites
    (family_id, token_hash, email, role, claim_person_id, created_by, expires_at, max_uses)
  values
    (p_family_id, extensions.digest(tok, 'sha256'), lower(nullif(trim(p_email), '')),
     p_role, p_claim_person_id, auth.uid(), now() + make_interval(days => p_valid_days), p_max_uses);
  return tok;
end $$;

-- Join a family from a link.
create or replace function public.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inv public.family_invites;
  my_email text;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;

  select * into inv from public.family_invites
  where token_hash = extensions.digest(p_token, 'sha256')
  for update;

  if not found or inv.revoked_at is not null or inv.expires_at < now()
     or inv.use_count >= inv.max_uses then
    raise exception 'Invite link is invalid or expired' using errcode = '22023';
  end if;

  if inv.email is not null then
    select lower(email) into my_email from auth.users where id = uid;
    if my_email is distinct from inv.email then
      raise exception 'This invite was sent to a different email' using errcode = '42501';
    end if;
  end if;

  insert into public.family_members (family_id, user_id, role, invited_by)
  values (inv.family_id, uid, inv.role, inv.created_by)
  on conflict (family_id, user_id) do nothing;

  -- Let the keeper guard know this change comes from a trusted RPC.
  perform set_config('app.trusted_rpc', 'on', true);
  if inv.claim_person_id is not null
     and not exists (select 1 from public.persons where family_id = inv.family_id and user_id = uid) then
    update public.persons
       set user_id = uid, managed_by = uid
     where id = inv.claim_person_id and user_id is null;
  end if;

  perform set_config('app.trusted_rpc', 'off', true);
  update public.family_invites set use_count = use_count + 1 where id = inv.id;
  return inv.family_id;
end $$;

-- Approve a merge: move everything from the duplicate onto the kept node.
create or replace function public.merge_persons(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  req  public.person_merge_requests;
  keep public.persons;
  dup  public.persons;
begin
  select * into req from public.person_merge_requests where id = p_request_id for update;
  if not found or req.status <> 'pending'
     or req.keep_person_id is null or req.drop_person_id is null then
    raise exception 'Merge request not found or already decided' using errcode = '22023';
  end if;
  if not app.is_admin(req.family_id) then
    raise exception 'Only admins can merge' using errcode = '42501';
  end if;

  select * into keep from public.persons where id = req.keep_person_id for update;
  select * into dup  from public.persons where id = req.drop_person_id for update;
  if keep.user_id is not null and dup.user_id is not null then
    raise exception 'Both people have accounts. Unlink one first.' using errcode = '23505';
  end if;

  -- Edges. Skip ones that would duplicate or point at the kept node itself.
  insert into public.parent_child (family_id, parent_id, child_id, kind, created_by)
  select family_id, keep.id, child_id, kind, created_by from public.parent_child
  where parent_id = dup.id and child_id <> keep.id
  on conflict do nothing;
  insert into public.parent_child (family_id, parent_id, child_id, kind, created_by)
  select family_id, parent_id, keep.id, kind, created_by from public.parent_child pc
  where child_id = dup.id and parent_id <> keep.id
    and (kind <> 'biological'
         or (select count(*) from public.parent_child x
             where x.child_id = keep.id and x.kind = 'biological') < 2)
  on conflict do nothing;
  insert into public.unions (family_id, partner_a, partner_b, married_on, married_precision,
                             ended_on, end_reason, created_by)
  select family_id,
         case when partner_a = dup.id then keep.id else partner_a end,
         case when partner_b = dup.id then keep.id else partner_b end,
         married_on, married_precision, ended_on, end_reason, created_by
  from public.unions u
  where (partner_a = dup.id or partner_b = dup.id)
    and keep.id not in (partner_a, partner_b)
  on conflict do nothing;

  -- Details: move rows the kept node doesn't already have.
  update public.person_education  set person_id = keep.id where person_id = dup.id;
  update public.person_occupations set person_id = keep.id where person_id = dup.id;
  insert into public.person_contact (person_id, family_id, phone, email, address_line, postal_code, visibility)
  select keep.id, family_id, phone, email, address_line, postal_code, visibility
  from public.person_contact where person_id = dup.id
  on conflict (person_id) do nothing;
  insert into public.person_private_fields (person_id, family_id, field, value)
  select keep.id, family_id, field, value from public.person_private_fields where person_id = dup.id
  on conflict do nothing;

  -- Fill blanks on the kept node from the duplicate.
  update public.persons k set
    birth_date      = coalesce(k.birth_date, dup.birth_date),
    birth_precision = case when k.birth_date is null then dup.birth_precision else k.birth_precision end,
    birth_time      = coalesce(k.birth_time, dup.birth_time),
    birth_place     = coalesce(k.birth_place, dup.birth_place),
    birth_order     = coalesce(k.birth_order, dup.birth_order),
    death_date      = coalesce(k.death_date, dup.death_date),
    native_place    = coalesce(k.native_place, dup.native_place),
    photo_path      = coalesce(k.photo_path, dup.photo_path),
    gender          = case when k.gender = 'unknown' then dup.gender else k.gender end
  where k.id = keep.id;

  update public.person_merge_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now(),
         drop_snapshot = to_jsonb(dup)
   where id = req.id;

  -- Unlink the account from the duplicate first (unique index), then delete it.
  update public.persons set user_id = null where id = dup.id;
  update public.persons set user_id = dup.user_id where id = keep.id and user_id is null and dup.user_id is not null;
  delete from public.persons where id = dup.id;
  return keep.id;
end $$;

-- Whole tree in one round trip. Built for slow 3G/4G phones.
-- Security invoker: RLS still decides what comes back.
create or replace function public.family_graph(p_family_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'persons', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.full_name, 'nick', p.nickname, 'g', p.gender,
        'dob', p.birth_date, 'dobp', p.birth_precision, 'ord', p.birth_order,
        'alive', p.is_living, 'dod', p.death_date, 'photo', p.photo_path,
        'uid', p.user_id, 'mgr', p.managed_by, 'state', p.state_code))
      from public.persons p where p.family_id = p_family_id), '[]'::jsonb),
    'parents', coalesce((select jsonb_agg(jsonb_build_array(pc.parent_id, pc.child_id, pc.kind))
      from public.parent_child pc where pc.family_id = p_family_id), '[]'::jsonb),
    'unions', coalesce((select jsonb_agg(jsonb_build_array(u.partner_a, u.partner_b, u.married_on, u.ended_on, u.end_reason))
      from public.unions u where u.family_id = p_family_id), '[]'::jsonb)
  )
$$;

revoke all on function public.create_family(text, text, text, public.gender_t) from public, anon;
revoke all on function public.create_invite(uuid, public.family_role_t, uuid, text, int, int) from public, anon;
revoke all on function public.accept_invite(text) from public, anon;
revoke all on function public.merge_persons(uuid) from public, anon;
revoke all on function public.family_graph(uuid) from public, anon;
grant execute on function public.create_family(text, text, text, public.gender_t) to authenticated;
grant execute on function public.create_invite(uuid, public.family_role_t, uuid, text, int, int) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.merge_persons(uuid) to authenticated;
grant execute on function public.family_graph(uuid) to authenticated;

-- =====================================================================
-- Nammoor :: short invite codes (8 characters, 48 hours)
--
-- Code alphabet has 32 symbols (no I or O), so 32^8 = 1.1 trillion codes.
-- Short codes are easier to guess than the old 48-character ones, so:
--   * the preview now needs sign-in (anon can no longer probe codes)
--   * every account gets 10 wrong guesses per 15 minutes
--   * a family can have at most 50 live invites
-- Tamil users mostly speak Tamil: new profiles default to Tamil names.
-- =====================================================================

drop function if exists public.create_invite(uuid, public.family_role_t, uuid, text, int, int);
drop function if exists public.accept_invite(text);
drop function if exists public.invite_preview(text);

-- Old long-token invites can't be matched by the new hash. Cancel them.
update public.family_invites set revoked_at = now() where revoked_at is null;
alter table public.family_invites alter column expires_at set default now() + interval '48 hours';

alter table public.profiles alter column relation_style set default 'tamil';
update public.profiles set relation_style = 'tamil' where relation_style = 'english_in';

-- Failed guesses. No grants, no policies: only the functions below touch it.
create table public.invite_attempts (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references auth.users(id) on delete cascade,
  at       timestamptz not null default now()
);
create index invite_attempts_user_idx on public.invite_attempts (user_id, at desc);
alter table public.invite_attempts enable row level security;
revoke all on public.invite_attempts from anon, authenticated;

-- "abcd-efgh", "ABCD EFGH" and "abcdefgh" are the same code.
create or replace function app.invite_code_hash(p text)
returns bytea language sql immutable set search_path = '' as $$
  select extensions.digest(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256')
$$;

-- Find a live invite by code. Counts wrong guesses and blocks guessers.
-- Returns the invite id, or null when the code is wrong.
create or replace function app.invite_find(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  found_id uuid;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;

  if (select count(*) from public.invite_attempts
       where user_id = uid and at > now() - interval '15 minutes') >= 10 then
    raise exception 'Too many wrong codes. Try again in 15 minutes.' using errcode = '54000';
  end if;

  select i.id into found_id from public.family_invites i
   where i.token_hash = app.invite_code_hash(p_code)
     and i.revoked_at is null and i.expires_at > now() and i.use_count < i.max_uses;

  if found_id is null then
    insert into public.invite_attempts (user_id) values (uid);
    delete from public.invite_attempts where user_id = uid and at < now() - interval '1 day';
  end if;
  return found_id;
end $$;

-- Make an invite. Returns the 8 character code ONCE; only its hash is stored.
create or replace function public.create_invite(
  p_family_id uuid, p_role public.family_role_t default 'editor',
  p_claim_person_id uuid default null, p_email text default null,
  p_max_uses int default 1)
returns text language plpgsql security definer set search_path = '' as $$
declare
  my_role  public.family_role_t := app.role_in(p_family_id);
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32 symbols
  bytes    bytea;
  code     text;
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
  if p_max_uses not between 1 and 20 then
    raise exception 'An invite can be used 1 to 20 times' using errcode = '22023';
  end if;
  if (select count(*) from public.family_invites
       where family_id = p_family_id and revoked_at is null
         and expires_at > now() and use_count < max_uses) >= 50 then
    raise exception 'Too many live invites. Cancel some first.' using errcode = '54000';
  end if;

  for attempt in 1..5 loop
    bytes := extensions.gen_random_bytes(8);
    code := '';
    for i in 0..7 loop
      code := code || substr(alphabet, (get_byte(bytes, i) & 31) + 1, 1);
    end loop;
    begin
      insert into public.family_invites
        (family_id, token_hash, email, role, claim_person_id, created_by, expires_at, max_uses)
      values
        (p_family_id, app.invite_code_hash(code), lower(nullif(trim(p_email), '')),
         p_role, p_claim_person_id, auth.uid(), now() + interval '48 hours', p_max_uses);
      return code;
    exception when unique_violation then
      null; -- same code already exists: draw again
    end;
  end loop;
  raise exception 'Could not make a code. Try again.' using errcode = '55000';
end $$;

-- Who invited you, to which family. Needs sign-in (see header).
-- Volatile on purpose: a wrong guess is written to invite_attempts.
create or replace function public.invite_preview(p_code text)
returns table (family_name text, invited_by text, person_name text, role public.family_role_t,
               email_locked boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  inv_id uuid := app.invite_find(p_code);
begin
  return query
    select f.name, nullif(pr.display_name, ''), p.full_name, i.role, i.email is not null
      from public.family_invites i
      join public.families f on f.id = i.family_id
      left join public.profiles pr on pr.id = i.created_by
      left join public.persons p on p.id = i.claim_person_id
     where i.id = inv_id;
end $$;

-- Join a family. Returns the family id, or null if the code is wrong.
create or replace function public.accept_invite(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inv_id uuid := app.invite_find(p_code);
  inv public.family_invites;
  my_email text;
begin
  if inv_id is null then return null; end if;

  select * into inv from public.family_invites where id = inv_id for update;
  if inv.revoked_at is not null or inv.expires_at < now() or inv.use_count >= inv.max_uses then
    return null;
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

  -- Let the keeper guard know this change comes from a trusted function.
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

revoke all on function app.invite_find(text) from public;
revoke all on function public.create_invite(uuid, public.family_role_t, uuid, text, int) from public, anon;
revoke all on function public.invite_preview(text) from public, anon;
revoke all on function public.accept_invite(text) from public, anon;
grant execute on function app.invite_find(text) to authenticated;
grant execute on function public.create_invite(uuid, public.family_role_t, uuid, text, int) to authenticated;
grant execute on function public.invite_preview(text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;

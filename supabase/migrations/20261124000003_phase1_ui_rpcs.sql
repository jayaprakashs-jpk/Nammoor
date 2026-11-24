-- =====================================================================
-- Nammoor :: Phase 1 RPCs used by the screens
-- =====================================================================

-- Add a relative next to an existing person, in ONE transaction.
-- Runs as the caller (security invoker), so every RLS rule still applies.
--   father / mother : new parent of p_anchor. If the other parent exists,
--                     the two parents are linked as a married couple.
--   spouse          : marriage between p_anchor and the new person.
--   child           : p_anchor is a parent. If p_anchor has exactly one
--                     current spouse, that spouse becomes the other parent.
--   sibling         : gets the same parents as p_anchor.
-- p_person keys: full_name (required), gender, birth_date, birth_precision,
--                birth_order, is_living
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
  if not found then
    raise exception 'Person not found' using errcode = 'P0002';
  end if;

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

  if p_relation = 'sibling'
     and not exists (select 1 from public.parent_child where child_id = a.id) then
    raise exception 'Add a parent first, then add brothers and sisters' using errcode = '22023';
  end if;

  insert into public.persons
    (family_id, managed_by, full_name, gender, birth_date, birth_precision, birth_order, is_living)
  values
    (a.family_id, auth.uid(), trim(p_person ->> 'full_name'), g, dob,
     coalesce(nullif(p_person ->> 'birth_precision', '')::public.date_precision_t,
              case when dob is null then 'unknown'::public.date_precision_t else 'exact'::public.date_precision_t end),
     nullif(p_person ->> 'birth_order', '')::smallint,
     coalesce((p_person ->> 'is_living')::boolean, true))
  returning id into new_id;

  if p_relation in ('father', 'mother') then
    insert into public.parent_child (family_id, parent_id, child_id) values (a.family_id, new_id, a.id);
    select pc.parent_id into other from public.parent_child pc
     where pc.child_id = a.id and pc.kind = 'biological' and pc.parent_id <> new_id
     limit 1;
    if other is not null then
      insert into public.unions (family_id, partner_a, partner_b)
      values (a.family_id, other, new_id)
      on conflict do nothing;
    end if;

  elsif p_relation = 'spouse' then
    insert into public.unions (family_id, partner_a, partner_b) values (a.family_id, a.id, new_id);

  elsif p_relation = 'child' then
    insert into public.parent_child (family_id, parent_id, child_id) values (a.family_id, a.id, new_id);
    if (select count(*) from public.unions u
         where (u.partner_a = a.id or u.partner_b = a.id) and u.ended_on is null) = 1 then
      select case when u.partner_a = a.id then u.partner_b else u.partner_a end into spouse
        from public.unions u
       where (u.partner_a = a.id or u.partner_b = a.id) and u.ended_on is null;
      insert into public.parent_child (family_id, parent_id, child_id) values (a.family_id, spouse, new_id);
    end if;

  else -- sibling
    insert into public.parent_child (family_id, parent_id, child_id, kind)
    select a.family_id, pc.parent_id, new_id, pc.kind
      from public.parent_child pc where pc.child_id = a.id;
  end if;

  return new_id;
end $$;

-- What an invite link points to, so people see who invited them before joining.
-- Knowing the token is the permission. Returns nothing for bad or used links.
create or replace function public.invite_preview(p_token text)
returns table (family_name text, invited_by text, person_name text, role public.family_role_t,
               email_locked boolean)
language sql stable security definer set search_path = '' as $$
  select f.name,
         nullif(pr.display_name, ''),
         p.full_name,
         i.role,
         i.email is not null
    from public.family_invites i
    join public.families f on f.id = i.family_id
    left join public.profiles pr on pr.id = i.created_by
    left join public.persons p on p.id = i.claim_person_id
   where i.token_hash = extensions.digest(p_token, 'sha256')
     and i.revoked_at is null
     and i.expires_at > now()
     and i.use_count < i.max_uses
$$;

revoke all on function public.add_relative(uuid, text, jsonb) from public, anon;
revoke all on function public.invite_preview(text) from public;
grant execute on function public.add_relative(uuid, text, jsonb) to authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated;

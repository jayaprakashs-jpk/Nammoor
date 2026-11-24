-- =====================================================================
-- Nammoor :: private group chats
-- Bug fix: a room's creator could not see their own new room (rooms_select
-- only allowed members), so adding the first member was silently refused.
-- =====================================================================

drop policy rooms_select on public.chat_rooms;
create policy rooms_select on public.chat_rooms for select to authenticated
  using (app.is_room_member(id) or created_by = (select auth.uid()));

-- Make a private group in one step. Everyone must already be in the family.
create or replace function public.create_group_chat(p_family_id uuid, p_name text, p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rid uuid;
  clean uuid[];
begin
  if uid is null or not app.is_member(p_family_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'Give the group a name (up to 80 letters)' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct m.user_id), '{}') into clean
    from public.family_members m
   where m.family_id = p_family_id and m.user_id = any (coalesce(p_member_ids, '{}')) and m.user_id <> uid;
  if cardinality(clean) < 1 then
    raise exception 'Pick at least one other family member' using errcode = '22023';
  end if;
  if cardinality(clean) > 100 then
    raise exception 'A group can have up to 100 people' using errcode = '22023';
  end if;

  insert into public.chat_rooms (family_id, kind, name, created_by)
  values (p_family_id, 'group', trim(p_name), uid) returning id into rid;
  insert into public.chat_room_members (room_id, user_id)
  select rid, x from unnest(array_append(clean, uid)) as x;
  return rid;
end $$;

revoke all on function public.create_group_chat(uuid, text, uuid[]) from public, anon;
grant execute on function public.create_group_chat(uuid, text, uuid[]) to authenticated;

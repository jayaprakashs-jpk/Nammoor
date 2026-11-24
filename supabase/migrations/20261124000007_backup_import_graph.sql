-- =====================================================================
-- Nammoor :: backup, import, and richer tree data
--  * family_graph also returns native place, death date precision and
--    marriage date precision (for lists, timeline, insights)
--  * export_family: whole tree as JSON, owners and admins only
--  * import_family_data: add people + links from a backup or GEDCOM in ONE
--    transaction. Owners and admins only. All or nothing.
-- Not exported, on purpose: salary, DNA, contact details, account links.
-- =====================================================================

create or replace function public.family_graph(p_family_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'persons', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.full_name, 'nick', p.nickname, 'g', p.gender,
        'dob', p.birth_date, 'dobp', p.birth_precision, 'ord', p.birth_order,
        'alive', p.is_living, 'dod', p.death_date, 'dodp', p.death_precision,
        'photo', p.photo_path, 'uid', p.user_id, 'mgr', p.managed_by,
        'state', p.state_code, 'np', p.native_place))
      from public.persons p where p.family_id = p_family_id), '[]'::jsonb),
    'parents', coalesce((select jsonb_agg(jsonb_build_array(pc.parent_id, pc.child_id, pc.kind))
      from public.parent_child pc where pc.family_id = p_family_id), '[]'::jsonb),
    'unions', coalesce((select jsonb_agg(jsonb_build_array(u.partner_a, u.partner_b, u.married_on, u.ended_on, u.end_reason, u.married_precision))
      from public.unions u where u.family_id = p_family_id), '[]'::jsonb)
  )
$$;

create or replace function public.export_family(p_family_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if not app.is_admin(p_family_id) then
    raise exception 'Only owners and admins can export the family' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'format', 'nammoor-family-backup',
    'version', 1,
    'exported_at', now(),
    'family', (select jsonb_build_object('name', f.name, 'native_place', f.native_place)
                 from public.families f where f.id = p_family_id),
    'persons', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'initials', p.initials, 'nickname', p.nickname,
        'name_native', p.name_native, 'gender', p.gender,
        'birth_date', p.birth_date, 'birth_precision', p.birth_precision, 'birth_time', p.birth_time,
        'birth_place', p.birth_place, 'birth_order', p.birth_order,
        'is_living', p.is_living, 'death_date', p.death_date, 'death_precision', p.death_precision,
        'native_place', p.native_place, 'current_city', p.current_city,
        'state_code', p.state_code, 'country_code', p.country_code, 'history', p.history)
        order by p.full_name, p.id)
      from public.persons p where p.family_id = p_family_id), '[]'::jsonb),
    'parent_child', coalesce((select jsonb_agg(jsonb_build_object('parent_id', pc.parent_id, 'child_id', pc.child_id, 'kind', pc.kind))
      from public.parent_child pc where pc.family_id = p_family_id), '[]'::jsonb),
    'unions', coalesce((select jsonb_agg(jsonb_build_object(
        'partner_a', u.partner_a, 'partner_b', u.partner_b, 'married_on', u.married_on,
        'married_precision', u.married_precision, 'ended_on', u.ended_on, 'end_reason', u.end_reason))
      from public.unions u where u.family_id = p_family_id), '[]'::jsonb),
    'education', coalesce((select jsonb_agg(jsonb_build_object(
        'person_id', e.person_id, 'level', e.level, 'course', e.course,
        'institution', e.institution, 'year_completed', e.year_completed))
      from public.person_education e where e.family_id = p_family_id), '[]'::jsonb),
    'occupations', coalesce((select jsonb_agg(jsonb_build_object(
        'person_id', o.person_id, 'title', o.title, 'organization', o.organization, 'city', o.city,
        'is_current', o.is_current, 'start_year', o.start_year, 'end_year', o.end_year))
      from public.person_occupations o where o.family_id = p_family_id), '[]'::jsonb)
  );
end $$;

-- Payload (built and checked by the app, checked again here):
--  persons:  [{ref, existing?, full_name, gender, birth_date, ..., education:[], occupations:[]}]
--  parents:  [[parentRef, childRef, kind]]
--  unions:   [[aRef, bRef, married_on, married_precision, ended_on, end_reason]]
-- A person with "existing" is linked to that person (blanks are filled in),
-- everyone else is added as new, unclaimed, and kept by the importer.
create or replace function public.import_family_data(p_family_id uuid, p_data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  p jsonb;
  l jsonb;
  e jsonb;
  ref text;
  ex uuid;
  new_id uuid;
  idmap jsonb := '{}'::jsonb;
  pa uuid;
  ch uuid;
  a uuid;
  b uuid;
  n_new int := 0;
  n_link int := 0;
  n_par int := 0;
  n_uni int := 0;
  rows int;
  dod date;
begin
  if uid is null or not app.is_admin(p_family_id) then
    raise exception 'Only owners and admins can import' using errcode = '42501';
  end if;
  if jsonb_typeof(p_data -> 'persons') is distinct from 'array' then
    raise exception 'Nothing to import' using errcode = '22023';
  end if;
  if jsonb_array_length(p_data -> 'persons') > 2000
     or jsonb_array_length(coalesce(p_data -> 'parents', '[]')) > 8000
     or jsonb_array_length(coalesce(p_data -> 'unions', '[]')) > 4000 then
    raise exception 'Too big to import at once (2000 people). Split the file.' using errcode = '54000';
  end if;

  for p in select * from jsonb_array_elements(p_data -> 'persons') loop
    ref := p ->> 'ref';
    if ref is null or idmap ? ref then
      raise exception 'Bad or repeated person reference in the file' using errcode = '22023';
    end if;
    ex := nullif(p ->> 'existing', '')::uuid;
    dod := nullif(p ->> 'death_date', '')::date;

    if ex is not null then
      if not exists (select 1 from public.persons where id = ex and family_id = p_family_id) then
        raise exception 'A person chosen to link was not found' using errcode = '22023';
      end if;
      update public.persons set
        birth_precision = case when birth_date is null and nullif(p ->> 'birth_date', '') is not null
                               then coalesce(nullif(p ->> 'birth_precision', '')::public.date_precision_t, 'exact')
                               else birth_precision end,
        birth_date  = coalesce(birth_date, nullif(p ->> 'birth_date', '')::date),
        birth_place = coalesce(birth_place, nullif(p ->> 'birth_place', '')),
        native_place = coalesce(native_place, nullif(p ->> 'native_place', '')),
        history = coalesce(history, nullif(p ->> 'history', ''))
      where id = ex;
      idmap := idmap || jsonb_build_object(ref, ex::text);
      n_link := n_link + 1;
    else
      insert into public.persons
        (family_id, managed_by, full_name, initials, nickname, name_native, gender,
         birth_date, birth_precision, birth_time, birth_place, birth_order,
         is_living, death_date, death_precision, native_place, current_city,
         state_code, country_code, history)
      values
        (p_family_id, uid,
         coalesce(nullif(trim(p ->> 'full_name'), ''), 'Unknown'),
         nullif(p ->> 'initials', ''), nullif(p ->> 'nickname', ''), nullif(p ->> 'name_native', ''),
         coalesce(nullif(p ->> 'gender', '')::public.gender_t, 'unknown'),
         nullif(p ->> 'birth_date', '')::date,
         coalesce(nullif(p ->> 'birth_precision', '')::public.date_precision_t,
                  case when nullif(p ->> 'birth_date', '') is null then 'unknown'::public.date_precision_t else 'exact'::public.date_precision_t end),
         nullif(p ->> 'birth_time', '')::time, nullif(p ->> 'birth_place', ''),
         nullif(p ->> 'birth_order', '')::smallint,
         case when dod is not null then false else coalesce((p ->> 'is_living')::boolean, true) end,
         dod,
         case when dod is null then 'unknown'::public.date_precision_t
              else coalesce(nullif(p ->> 'death_precision', '')::public.date_precision_t, 'exact') end,
         nullif(p ->> 'native_place', ''), nullif(p ->> 'current_city', ''),
         nullif(p ->> 'state_code', ''), nullif(p ->> 'country_code', ''), nullif(p ->> 'history', ''))
      returning id into new_id;
      idmap := idmap || jsonb_build_object(ref, new_id::text);
      n_new := n_new + 1;

      for e in select * from jsonb_array_elements(coalesce(p -> 'education', '[]')) loop
        insert into public.person_education (person_id, family_id, level, course, institution, year_completed)
        values (new_id, p_family_id, coalesce(nullif(e ->> 'level', ''), 'other'),
                nullif(e ->> 'course', ''), nullif(e ->> 'institution', ''), nullif(e ->> 'year_completed', '')::smallint);
      end loop;
      for e in select * from jsonb_array_elements(coalesce(p -> 'occupations', '[]')) loop
        insert into public.person_occupations (person_id, family_id, title, organization, city, is_current, start_year, end_year)
        values (new_id, p_family_id, coalesce(nullif(trim(e ->> 'title'), ''), 'Work'),
                nullif(e ->> 'organization', ''), nullif(e ->> 'city', ''),
                coalesce((e ->> 'is_current')::boolean, true),
                nullif(e ->> 'start_year', '')::smallint, nullif(e ->> 'end_year', '')::smallint);
      end loop;
    end if;
  end loop;

  for l in select * from jsonb_array_elements(coalesce(p_data -> 'parents', '[]')) loop
    pa := (idmap ->> (l ->> 0))::uuid;
    ch := (idmap ->> (l ->> 1))::uuid;
    if pa is null or ch is null then
      raise exception 'A parent link points to someone who is not in the file' using errcode = '22023';
    end if;
    insert into public.parent_child (family_id, parent_id, child_id, kind)
    values (p_family_id, pa, ch, coalesce(nullif(l ->> 2, '')::public.parent_kind_t, 'biological'))
    on conflict do nothing;
    get diagnostics rows = row_count;
    n_par := n_par + rows;
  end loop;

  for l in select * from jsonb_array_elements(coalesce(p_data -> 'unions', '[]')) loop
    a := (idmap ->> (l ->> 0))::uuid;
    b := (idmap ->> (l ->> 1))::uuid;
    if a is null or b is null then
      raise exception 'A marriage points to someone who is not in the file' using errcode = '22023';
    end if;
    if a <> b then
      insert into public.unions (family_id, partner_a, partner_b, married_on, married_precision, ended_on, end_reason)
      values (p_family_id, a, b, nullif(l ->> 2, '')::date,
              coalesce(nullif(l ->> 3, '')::public.date_precision_t,
                       case when nullif(l ->> 2, '') is null then 'unknown'::public.date_precision_t else 'exact'::public.date_precision_t end),
              nullif(l ->> 4, '')::date, nullif(l ->> 5, '')::public.union_end_t)
      on conflict do nothing;
      get diagnostics rows = row_count;
      n_uni := n_uni + rows;
    end if;
  end loop;

  return jsonb_build_object('added', n_new, 'linked', n_link, 'parent_links', n_par, 'marriages', n_uni);
end $$;

revoke all on function public.export_family(uuid) from public, anon;
revoke all on function public.import_family_data(uuid, jsonb) from public, anon;
grant execute on function public.export_family(uuid) to authenticated;
grant execute on function public.import_family_data(uuid, jsonb) to authenticated;

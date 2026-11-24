-- =====================================================================
-- Nammoor :: speed up reads
-- A 'for all' policy also runs on every SELECT. On a 500 person tree that
-- means 500 extra permission checks per load. Split write rules into
-- insert / update / delete so reads only run the cheap membership check.
-- =====================================================================

drop policy pc_write on public.parent_child;
create policy pc_insert on public.parent_child for insert to authenticated
  with check (app.can_edit_person(parent_id) or app.can_edit_person(child_id));
create policy pc_update on public.parent_child for update to authenticated
  using (app.can_edit_person(parent_id) or app.can_edit_person(child_id)) with check (app.can_edit_person(parent_id) or app.can_edit_person(child_id));
create policy pc_delete on public.parent_child for delete to authenticated
  using (app.can_edit_person(parent_id) or app.can_edit_person(child_id));

drop policy unions_write on public.unions;
create policy unions_insert on public.unions for insert to authenticated
  with check (app.can_edit_person(partner_a) or app.can_edit_person(partner_b));
create policy unions_update on public.unions for update to authenticated
  using (app.can_edit_person(partner_a) or app.can_edit_person(partner_b)) with check (app.can_edit_person(partner_a) or app.can_edit_person(partner_b));
create policy unions_delete on public.unions for delete to authenticated
  using (app.can_edit_person(partner_a) or app.can_edit_person(partner_b));

drop policy contact_write on public.person_contact;
create policy contact_insert on public.person_contact for insert to authenticated
  with check (app.can_edit_person(person_id));
create policy contact_update on public.person_contact for update to authenticated
  using (app.can_edit_person(person_id)) with check (app.can_edit_person(person_id));
create policy contact_delete on public.person_contact for delete to authenticated
  using (app.can_edit_person(person_id));

drop policy education_write on public.person_education;
create policy education_insert on public.person_education for insert to authenticated
  with check (app.can_edit_person(person_id));
create policy education_update on public.person_education for update to authenticated
  using (app.can_edit_person(person_id)) with check (app.can_edit_person(person_id));
create policy education_delete on public.person_education for delete to authenticated
  using (app.can_edit_person(person_id));

drop policy occupations_write on public.person_occupations;
create policy occupations_insert on public.person_occupations for insert to authenticated
  with check (app.can_edit_person(person_id));
create policy occupations_update on public.person_occupations for update to authenticated
  using (app.can_edit_person(person_id)) with check (app.can_edit_person(person_id));
create policy occupations_delete on public.person_occupations for delete to authenticated
  using (app.can_edit_person(person_id));

drop policy private_write on public.person_private_fields;
create policy private_insert on public.person_private_fields for insert to authenticated
  with check (app.owns_private(person_id));
create policy private_update on public.person_private_fields for update to authenticated
  using (app.owns_private(person_id)) with check (app.owns_private(person_id));
create policy private_delete on public.person_private_fields for delete to authenticated
  using (app.owns_private(person_id));

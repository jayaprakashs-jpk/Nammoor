-- =====================================================================
-- Nammoor :: Phase 1 storage buckets + realtime
-- Supabase-only objects (storage schema, supabase_realtime publication).
-- =====================================================================

-- Person photos. Path: {family_id}/{person_id}/{file}.webp
-- Private bucket. App reads through signed URLs.
-- 2 MB cap, but the app compresses to about 150 KB before upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('person-photos', 'person-photos', false, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Chat attachments. Path: {room_id}/{uuid}.{ext}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'person-photos'
         and app.is_member(app.try_uuid((storage.foldername(name))[1])));

create policy photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'person-photos'
              and app.can_edit_person(app.try_uuid((storage.foldername(name))[2]))
              and exists (select 1 from public.persons p
                          where p.id = app.try_uuid((storage.foldername(name))[2])
                            and p.family_id = app.try_uuid((storage.foldername(name))[1])));

create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'person-photos'
         and app.can_edit_person(app.try_uuid((storage.foldername(name))[2])));

create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'person-photos'
         and app.can_edit_person(app.try_uuid((storage.foldername(name))[2])));

create policy chat_media_read on storage.objects for select to authenticated
  using (bucket_id = 'chat-media'
         and app.is_room_member(app.try_uuid((storage.foldername(name))[1])));

create policy chat_media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media'
              and app.is_room_member(app.try_uuid((storage.foldername(name))[1])));

-- Live chat. RLS on chat_messages still decides who gets each row.
alter publication supabase_realtime add table public.chat_messages;

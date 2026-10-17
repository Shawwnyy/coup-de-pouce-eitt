-- =====================================================================
-- Coup de Pouce by EITT — 3/3 : stockage de fichiers (Supabase Storage)
--
--  avatars      : PUBLIC en lecture (photo de profil choisie par l'utilisateur), 1 Mo, png/jpeg/webp
--  help-images  : PRIVÉ, lisible par les membres connectés, 5 Mo, png/jpeg/webp/gif
--  chat-media   : PRIVÉ, lisible uniquement par les 2 participants de la conversation (liens signés
--                 temporaires), 20 Mo max, images/GIF (5 Mo vérifiés par send_message) et vidéos mp4/webm.
-- Le SVG est volontairement refusé partout : il peut contenir du script.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',     'avatars',     true,  1048576,  array['image/png', 'image/jpeg', 'image/webp']),
  ('help-images', 'help-images', false, 5242880,  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('chat-media',  'chat-media',  false, 20971520, array['image/png', 'image/jpeg', 'image/webp', 'image/gif',
                                                        'video/mp4', 'video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Fonction d'aide : le premier dossier du chemin est l'id d'une conversation où je peux écrire ?
create or replace function private.can_upload_to_conversation(p_folder text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.can_post_in(p_folder::uuid)
           -- quota anti-saturation : 200 fichiers par utilisateur dans chat-media
           and (select count(*) from storage.objects o
                 where o.bucket_id = 'chat-media' and o.owner_id = auth.uid()::text) < 200
    else false
  end;
$$;
create or replace function private.can_read_conversation_folder(p_folder text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.is_member(p_folder::uuid)
    else false
  end;
$$;
revoke all on function private.can_upload_to_conversation(text), private.can_read_conversation_folder(text) from public, anon;
grant execute on function private.can_upload_to_conversation(text), private.can_read_conversation_folder(text) to authenticated;

-- ----- avatars : chacun écrit uniquement dans son dossier <uid>/ -----
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_select_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ----- help-images : écriture dans <uid>/, lecture par les membres connectés -----
create policy help_images_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'help-images' and (storage.foldername(name))[1] = (select auth.uid())::text
              and private.rules_ok());
create policy help_images_select on storage.objects for select to authenticated
  using (bucket_id = 'help-images');
create policy help_images_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'help-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ----- chat-media : dossier = id de la conversation, réservé aux deux participants -----
create policy chat_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and private.can_upload_to_conversation((storage.foldername(name))[1]));
create policy chat_media_select on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and private.can_read_conversation_folder((storage.foldername(name))[1]));
create policy chat_media_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and owner_id = (select auth.uid())::text);

-- =====================================================================
-- Coup de Pouce by EITT — 2/3 : sécurité (RLS, privilèges, fonctions RPC)
--
-- Principe : tout est interdit par défaut, puis on ouvre le strict nécessaire.
--  * Aucune table n'est accessible sans connexion (rôle `anon` : aucun droit).
--  * Les écritures sensibles (créer une conversation, envoyer un message, signaler,
--    rechercher) passent par des fonctions RPC qui revérifient tout côté serveur.
--  * La clé "service_role" n'est jamais utilisée par le frontend.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Fonctions RPC (security definer + search_path vide : pas de détournement)
-- ---------------------------------------------------------------------

-- Recherche d'un utilisateur par identifiant public EXACT (User#0001, user 1, 0001…).
-- Pas de recherche partielle : impossible de parcourir la liste des membres.
create or replace function public.search_profiles(p_query text)
returns table (id uuid, public_id text, display_name text, avatar_path text, bio text, can_contact boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me  uuid := auth.uid();
  v_m   text[];
  v_num integer;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  perform private.check_rate('search', 30, interval '1 minute');  -- anti-abus : 30 recherches / minute
  v_m := regexp_match(coalesce(p_query, ''), '^\s*(?:user)?\s*#?\s*(\d{1,9})\s*$', 'i');
  if v_m is null then return; end if;
  v_num := v_m[1]::integer;
  return query
    select p.id, p.public_id, p.display_name, p.avatar_path, p.bio,
           (p.id <> v_me
            and coalesce(s.allow_contact, true)
            and not private.is_blocked_between(v_me, p.id)) as can_contact
      from public.profiles p
      left join public.user_settings s on s.user_id = p.id
     where p.public_number = v_num
       and (p.id = v_me or coalesce(s.searchable, true))
       -- un utilisateur qui m'a bloqué reste introuvable pour moi
       and not exists (select 1 from public.user_blocks b where b.blocker_id = p.id and b.blocked_id = v_me);
end $$;

create or replace function public.accept_rules(p_version text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_version is distinct from private.current_rules_version() then raise exception 'invalid_rules_version'; end if;
  update public.user_settings
     set rules_accepted_at = now(), rules_version = p_version
   where user_id = auth.uid();
end $$;

create or replace function public.start_conversation(p_other uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_a  uuid;
  v_b  uuid;
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if not private.rules_ok() then raise exception 'rules_required'; end if;
  if p_other is null or p_other = v_me then raise exception 'invalid_target'; end if;
  -- Même message pour « inexistant », « bloqué » ou « contacts refusés » : on ne révèle rien.
  if not exists (select 1 from public.profiles where id = p_other)
     or private.is_blocked_between(v_me, p_other) then
    raise exception 'contact_unavailable';
  end if;
  v_a := least(v_me, p_other);
  v_b := greatest(v_me, p_other);
  select c.id into v_id from public.conversations c where c.user_a = v_a and c.user_b = v_b;
  if v_id is null then
    if not coalesce((select s.allow_contact from public.user_settings s where s.user_id = p_other), true) then
      raise exception 'contact_unavailable';
    end if;
    perform private.check_rate('conversation', 20, interval '1 hour');
    insert into public.conversations (user_a, user_b, created_by) values (v_a, v_b, v_me)
    on conflict (user_a, user_b) do update set user_a = excluded.user_a
    returning id into v_id;
  end if;
  -- si j'avais quitté la conversation, elle réapparaît dans ma liste
  update public.conversations set user_a_archived = false where id = v_id and user_a = v_me;
  update public.conversations set user_b_archived = false where id = v_id and user_b = v_me;
  return v_id;
end $$;

create or replace function public.send_message(p_conversation uuid, p_content text, p_attachments jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me      uuid := auth.uid();
  v_content text := btrim(coalesce(p_content, ''));
  v_n       integer;
  v_msg     uuid;
  v_att     jsonb;
  v_path    text;
  v_name    text;
  v_obj     record;
  v_mime    text;
  v_size    bigint;
  v_max     bigint;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if not private.rules_ok() then raise exception 'rules_required'; end if;
  if not private.is_member(p_conversation) then raise exception 'not_member'; end if;
  if not private.can_post_in(p_conversation) then raise exception 'contact_unavailable'; end if;
  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) is distinct from 'array' then raise exception 'invalid_attachments'; end if;
  v_n := jsonb_array_length(coalesce(p_attachments, '[]'::jsonb));
  if v_n > 4 then raise exception 'too_many_attachments'; end if;
  if char_length(v_content) > 2000 then raise exception 'message_too_long'; end if;
  if v_content = '' and v_n = 0 then raise exception 'empty_message'; end if;
  perform private.check_rate('message', 30, interval '1 minute');

  insert into public.messages (conversation_id, sender_id, content)
  values (p_conversation, v_me, v_content) returning id into v_msg;

  for v_att in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    v_path := v_att ->> 'path';
    v_name := left(coalesce(nullif(btrim(v_att ->> 'name'), ''), 'fichier'), 120);
    -- chemin attendu : <id-conversation>/<uuid>.<ext>
    if v_path is null
       or v_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'
       or split_part(v_path, '/', 1) <> p_conversation::text then
      raise exception 'invalid_attachment_path';
    end if;
    -- On lit la taille et le type RÉELS enregistrés par le stockage (pas ceux envoyés par le client).
    select o.metadata, o.owner_id into v_obj
      from storage.objects o where o.bucket_id = 'chat-media' and o.name = v_path;
    if not found or v_obj.owner_id is distinct from v_me::text then raise exception 'attachment_not_found'; end if;
    v_mime := v_obj.metadata ->> 'mimetype';
    v_size := (v_obj.metadata ->> 'size')::bigint;
    v_max := case
      when v_mime in ('image/png', 'image/jpeg', 'image/webp', 'image/gif') then 5242880   --  5 Mo
      when v_mime in ('video/mp4', 'video/webm') then 20971520                              -- 20 Mo
      else null end;
    if v_max is null then raise exception 'file_type_not_allowed'; end if;
    if v_size is null or v_size <= 0 or v_size > v_max then raise exception 'file_too_large'; end if;
    insert into public.message_attachments (message_id, owner_id, storage_path, file_name, mime_type, file_size)
    values (v_msg, v_me, v_path, v_name, v_mime, v_size::integer);
  end loop;

  update public.conversations
     set last_message_at = now(), user_a_archived = false, user_b_archived = false,
         user_a_read_at = case when user_a = v_me then now() else user_a_read_at end,
         user_b_read_at = case when user_b = v_me then now() else user_b_read_at end
   where id = p_conversation;
  return v_msg;
end $$;

create or replace function public.mark_read(p_conversation uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.conversations set user_a_read_at = now() where id = p_conversation and user_a = auth.uid();
  update public.conversations set user_b_read_at = now() where id = p_conversation and user_b = auth.uid();
end $$;

create or replace function public.archive_conversation(p_conversation uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.conversations set user_a_archived = p_archived where id = p_conversation and user_a = auth.uid();
  update public.conversations set user_b_archived = p_archived where id = p_conversation and user_b = auth.uid();
end $$;

-- Liste des conversations de l'utilisateur (security invoker : les politiques RLS s'appliquent).
create or replace function public.list_conversations()
returns table (conversation_id uuid, other_id uuid, other_public_id text, other_display_name text,
               other_avatar_path text, last_message_at timestamptz, last_message_content text,
               last_message_sender uuid, last_has_attachment boolean, unread_count integer, blocked_by_me boolean)
language sql stable security invoker set search_path = '' as $$
  select c.id, o.id, o.public_id, o.display_name, o.avatar_path, c.last_message_at,
         lm.content, lm.sender_id, coalesce(lm.has_att, false),
         (select count(*)::integer from public.messages m
           where m.conversation_id = c.id and m.sender_id <> auth.uid()
             and m.created_at > case when c.user_a = auth.uid() then c.user_a_read_at else c.user_b_read_at end),
         exists (select 1 from public.user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = o.id)
    from public.conversations c
    join public.profiles o on o.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
    left join lateral (
      select m.content, m.sender_id,
             exists (select 1 from public.message_attachments a where a.message_id = m.id) as has_att
        from public.messages m where m.conversation_id = c.id
       order by m.created_at desc limit 1) lm on true
   where auth.uid() in (c.user_a, c.user_b)
     and not (case when c.user_a = auth.uid() then c.user_a_archived else c.user_b_archived end)
     and (c.last_message_at is not null or c.created_by = auth.uid())
   order by coalesce(c.last_message_at, c.created_at) desc;
$$;

-- Signalement d'un message, d'un profil ou d'une demande d'aide.
-- Enregistre l'auteur, la cible, le motif, la date, le statut et un instantané du contenu.
create or replace function public.report_content(p_kind text, p_target uuid, p_reason text, p_details text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me   uuid := auth.uid();
  v_user uuid;
  v_msg  uuid;
  v_help uuid;
  v_snap text;
  v_id   uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_reason is null or p_reason not in ('harcelement', 'arnaque', 'donnees_personnelles',
       'contenu_inapproprie', 'spam', 'usurpation', 'autre') then
    raise exception 'invalid_reason';
  end if;
  if p_details is not null and char_length(p_details) > 1000 then raise exception 'details_too_long'; end if;

  if p_kind = 'message' then
    select m.sender_id, m.content into v_user, v_snap
      from public.messages m where m.id = p_target and private.is_member(m.conversation_id);
    if not found then raise exception 'target_not_found'; end if;
    v_msg := p_target;
  elsif p_kind = 'help_request' then
    select h.author_id, left(h.title || E'\n' || h.description, 2200) into v_user, v_snap
      from public.help_requests h where h.id = p_target;
    if not found then raise exception 'target_not_found'; end if;
    v_help := p_target;
  elsif p_kind = 'profile' then
    select p.id, left(coalesce(p.display_name, '') || E'\n' || coalesce(p.bio, ''), 400) into v_user, v_snap
      from public.profiles p where p.id = p_target;
    if not found then raise exception 'target_not_found'; end if;
  else
    raise exception 'invalid_kind';
  end if;
  if v_user = v_me then raise exception 'cannot_report_self'; end if;

  -- Un seul signalement ouvert par cible et par personne.
  select r.id into v_id from public.reports r
   where r.reporter_id = v_me and r.status in ('open', 'in_review')
     and r.message_id is not distinct from v_msg
     and r.help_request_id is not distinct from v_help
     and (p_kind <> 'profile' or (r.reported_user_id = v_user and r.message_id is null and r.help_request_id is null))
   limit 1;
  if v_id is not null then return v_id; end if;

  perform private.check_rate('report', 10, interval '1 hour');
  insert into public.reports (reporter_id, reported_user_id, reported_public_id, message_id, help_request_id,
                              reason, details, content_snapshot)
  select v_me, v_user, p.public_id, v_msg, v_help, p_reason, nullif(btrim(p_details), ''), v_snap
    from public.profiles p where p.id = v_user
  returning id into v_id;
  return v_id;
end $$;

-- Suppression du compte et des données associées (le client supprime d'abord ses fichiers du stockage).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from auth.users where id = auth.uid();   -- cascade : profil, réglages, messages, demandes, blocages
end $$;

-- ---------------------------------------------------------------------
-- 2. Privilèges : on retire tout, puis on accorde au cas par cas
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Schéma private : accessible seulement pour appeler les fonctions d'aide des politiques RLS.
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on all tables    in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_rules_version(), private.is_member(uuid),
  private.is_blocked_between(uuid, uuid), private.rules_ok(), private.can_post_in(uuid),
  private.is_moderator() to authenticated;
alter table private.rate_events enable row level security;   -- aucune politique : inaccessible via l'API
alter table private.moderators  enable row level security;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_path, bio) on public.profiles to authenticated;   -- ni id ni public_id

grant select on public.user_settings to authenticated;
grant update (theme, theme_custom, notification_preferences, allow_contact, searchable)
  on public.user_settings to authenticated;                                          -- pas rules_*

grant select, delete on public.help_requests to authenticated;
grant insert (title, description, category, image_path) on public.help_requests to authenticated;
grant update (title, description, category, status, image_path) on public.help_requests to authenticated;

grant select on public.conversations to authenticated;           -- écriture uniquement via RPC
grant select, delete on public.messages to authenticated;        -- l'envoi passe par send_message()
grant select on public.message_attachments to authenticated;

grant select, delete on public.user_blocks to authenticated;
grant insert (blocked_id) on public.user_blocks to authenticated;

grant select on public.reports to authenticated;                 -- filtré par RLS : modérateurs uniquement
grant update (status) on public.reports to authenticated;

grant execute on function
  public.search_profiles(text), public.accept_rules(text), public.start_conversation(uuid),
  public.send_message(uuid, text, jsonb), public.mark_read(uuid), public.archive_conversation(uuid, boolean),
  public.list_conversations(), public.report_content(text, uuid, text, text), public.delete_my_account()
  to authenticated;

-- ---------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.user_settings       enable row level security;
alter table public.help_requests       enable row level security;
alter table public.conversations       enable row level security;
alter table public.messages            enable row level security;
alter table public.message_attachments enable row level security;
alter table public.user_blocks         enable row level security;
alter table public.reports             enable row level security;

-- Profils : lisibles par les membres connectés (aucune donnée privée dans cette table),
-- modifiables uniquement par leur propriétaire et seulement les colonnes autorisées ci-dessus.
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Réglages : strictement privés.
create policy settings_select_own on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy settings_update_own on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Demandes d'aide : lisibles par les membres connectés (sauf blocage), écrites par leur auteur
-- après acceptation des règles.
create policy help_select on public.help_requests for select to authenticated
  using (author_id = (select auth.uid()) or not private.is_blocked_between(author_id, (select auth.uid())));
create policy help_insert on public.help_requests for insert to authenticated
  with check (author_id = (select auth.uid()) and private.rules_ok());
create policy help_update_own on public.help_requests for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy help_delete_own on public.help_requests for delete to authenticated
  using (author_id = (select auth.uid()));

-- Conversations et messages : seulement pour les deux participants.
create policy conversations_select_members on public.conversations for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));
create policy messages_select_members on public.messages for select to authenticated
  using (private.is_member(conversation_id));
create policy messages_delete_own on public.messages for delete to authenticated
  using (sender_id = (select auth.uid()) and private.is_member(conversation_id));
-- (aucune politique d'insertion : on ne peut écrire qu'avec send_message())
create policy attachments_select_members on public.message_attachments for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));   -- RLS de messages appliquée

-- Blocages : chacun gère sa propre liste.
create policy blocks_select_own on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy blocks_insert_own on public.user_blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()) and blocked_id <> (select auth.uid()));
create policy blocks_delete_own on public.user_blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- Signalements : lisibles et traitables uniquement par les modérateurs (table private.moderators).
create policy reports_select_moderators on public.reports for select to authenticated
  using (private.is_moderator());
create policy reports_update_moderators on public.reports for update to authenticated
  using (private.is_moderator()) with check (private.is_moderator());

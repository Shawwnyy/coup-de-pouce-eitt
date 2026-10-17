-- =====================================================================
-- Tests de sécurité : identifiants publics, RLS, RPC, blocage, signalements, stockage, anti-abus.
-- Chaque test se connecte comme un vrai rôle `authenticated` (ou `anon`) avec un utilisateur donné.
-- Une assertion qui échoue arrête le script avec « ÉCHEC : … ».
-- =====================================================================
create schema tests;
grant usage on schema tests to public;
create table tests.u (name text primary key, id uuid not null);
insert into tests.u values
  ('alice', 'a1111111-1111-4111-8111-111111111111'),
  ('bob',   'b2222222-2222-4222-8222-222222222222'),
  ('carol', 'c3333333-3333-4333-8333-333333333333'),
  ('dave',  'd4444444-4444-4444-8444-444444444444'),
  ('erin',  'e5555555-5555-4555-8555-555555555555'),
  ('frank', 'f6666666-6666-4666-8666-666666666666');
grant select on tests.u to public;

create function tests.uid(p_name text) returns uuid language sql stable as $$ select id from tests.u where name = p_name $$;
create function tests.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', tests.uid(p_name)::text, false);
  set role authenticated;
end $$;
create function tests.logout() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
end $$;
create function tests.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'ÉCHEC : %', p_name; end if;
  raise notice '  ok  %', p_name;
end $$;
-- Attend qu'une requête échoue avec un message contenant p_expected.
create function tests.err(p_sql text, p_expected text, p_name text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin execute p_sql; exception when others then v_msg := sqlerrm; end;
  if v_msg is null then raise exception 'ÉCHEC (aucune erreur) : %', p_name; end if;
  if v_msg not ilike '%' || p_expected || '%' then
    raise exception 'ÉCHEC (erreur inattendue « % ») : %', v_msg, p_name;
  end if;
  raise notice '  ok  % — refusé : %', p_name, v_msg;
end $$;
create function tests.count(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin execute format('select count(*) from (%s) q', p_sql) into n; return n; end $$;
create function tests.rows(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin execute p_sql; get diagnostics n = row_count; return n; end $$;
grant execute on all functions in schema tests to public;

\echo '== 1. Inscription : profils, identifiants publics, réglages par défaut'
insert into auth.users (id, email, raw_user_meta_data) values
  (tests.uid('alice'), 'alice@example.org', '{"display_name":"  Alice  ","rules_version":"2026-10-17"}'),
  (tests.uid('bob'),   'bob@example.org',   '{"rules_version":"2026-10-17"}'),
  (tests.uid('carol'), 'carol@example.org', '{}');

select tests.ok((select public_id from public.profiles where id = tests.uid('alice')) = 'User#0001', 'alice = User#0001');
select tests.ok((select public_id from public.profiles where id = tests.uid('bob'))   = 'User#0002', 'bob = User#0002');
select tests.ok((select public_id from public.profiles where id = tests.uid('carol')) = 'User#0003', 'carol = User#0003');
select tests.ok((select display_name from public.profiles where id = tests.uid('alice')) = 'Alice', 'nom d''affichage nettoyé');
select tests.ok((select display_name from public.profiles where id = tests.uid('bob')) is null, 'nom d''affichage facultatif');
select tests.ok((select count(distinct public_id) from public.profiles) = 3, 'identifiants publics uniques');
select tests.ok((select rules_accepted_at is not null from public.user_settings where user_id = tests.uid('alice')), 'règles acceptées à l''inscription (alice)');
select tests.ok((select rules_accepted_at is null from public.user_settings where user_id = tests.uid('carol')), 'carol n''a pas encore accepté les règles');
select tests.ok((select (notification_preferences ->> 'browser')::boolean = false
                    and (notification_preferences ->> 'email')::boolean = false
                    and (notification_preferences ->> 'sound')::boolean = false
                    and (notification_preferences ->> 'visual_alerts')::boolean = false
                    and (notification_preferences ->> 'inapp_indicator')::boolean = true
                   from public.user_settings where user_id = tests.uid('bob')),
  'notifications : navigateur, e-mail, sons et alertes désactivés par défaut');
select tests.ok(not exists (select 1 from information_schema.columns
                             where table_schema = 'public' and column_name ilike '%mail%'), 'aucune colonne e-mail dans le schéma public');

\echo '== 2. Accès anonyme et données privées'
set role anon;
select tests.err('select * from public.profiles', 'permission denied', 'anon ne lit pas les profils');
select tests.err('select * from public.messages', 'permission denied', 'anon ne lit pas les messages');
select tests.err($q$select public.search_profiles('User#0001')$q$, 'permission denied', 'anon ne peut pas chercher');
reset role;
select tests.login('alice');
select tests.err('select * from auth.users', 'permission denied', 'un membre ne lit pas auth.users (e-mails)');
select tests.err('select * from private.rate_events', 'permission denied', 'schéma private inaccessible');

\echo '== 3. Recherche par identifiant exact'
select tests.ok(tests.count($q$select * from public.search_profiles('User#0002')$q$) = 1, 'User#0002 trouvé');
select tests.ok(tests.count($q$select * from public.search_profiles('user 2')$q$) = 1, '« user 2 » accepté');
select tests.ok(tests.count($q$select * from public.search_profiles(' 0002 ')$q$) = 1, '« 0002 » accepté');
select tests.ok(tests.count($q$select * from public.search_profiles('User#9999')$q$) = 0, 'identifiant inexistant → aucun résultat');
select tests.ok(tests.count($q$select * from public.search_profiles('User#')$q$) = 0, 'saisie incomplète → aucun résultat');
select tests.ok(tests.count($q$select * from public.search_profiles('%')$q$) = 0, 'pas de joker');
select tests.ok(tests.count($q$select * from public.search_profiles($x$' or 1=1 --$x$)$q$) = 0, 'injection SQL inoffensive');
select tests.ok((select can_contact from public.search_profiles('User#0002')) is true, 'bob peut être contacté');
select tests.ok((select can_contact from public.search_profiles('User#0001')) is false, 'on ne se contacte pas soi-même');
select tests.logout();

\echo '== 4. Profils : un membre ne modifie que lui-même, et jamais son identifiant'
select tests.login('alice');
select tests.ok(tests.rows($q$update public.profiles set bio = 'Salut' where id = tests.uid('alice')$q$) = 1, 'alice modifie sa bio');
select tests.ok(tests.rows($q$update public.profiles set bio = 'piraté' where id = tests.uid('bob')$q$) = 0, 'alice ne modifie pas le profil de bob (RLS)');
select tests.err($q$update public.profiles set public_number = 99 where id = tests.uid('alice')$q$, 'permission denied', 'public_number non modifiable');
select tests.err($q$update public.profiles set public_id = 'User#0099' where id = tests.uid('alice')$q$, 'public_id', 'public_id non modifiable (colonne calculée)');
select tests.err($q$update public.profiles set id = gen_random_uuid() where id = tests.uid('alice')$q$, 'permission denied', 'id non modifiable');
select tests.err($q$insert into public.profiles (id) values (gen_random_uuid())$q$, 'permission denied', 'pas de création de faux profil');
select tests.err($q$delete from public.profiles where id = tests.uid('bob')$q$, 'permission denied', 'pas de suppression de profil');
select tests.err($q$update public.profiles set avatar_path = 'autre/avatar.png' where id = tests.uid('alice')$q$, 'violates check constraint', 'avatar limité à son propre dossier');
select tests.ok(tests.count($q$select * from public.user_settings where user_id = tests.uid('bob')$q$) = 0, 'réglages de bob invisibles pour alice');
select tests.ok(tests.rows($q$update public.user_settings set theme = 'light' where user_id = tests.uid('bob')$q$) = 0, 'réglages de bob non modifiables');
select tests.ok(tests.rows($q$update public.user_settings set theme = 'custom' where user_id = tests.uid('alice')$q$) = 1, 'alice modifie ses réglages');
select tests.err($q$update public.user_settings set rules_version = '2026-10-17' where user_id = tests.uid('alice')$q$, 'permission denied', 'acceptation des règles non falsifiable');
select tests.err($q$update public.user_settings set theme = 'rose' where user_id = tests.uid('alice')$q$, 'violates check constraint', 'thème invalide refusé');
select tests.logout();
update public.user_settings set theme = 'eitt' where user_id = tests.uid('alice');
select tests.err($q$update public.profiles set public_number = 99 where id = tests.uid('alice')$q$, 'immutable_identifier', 'même un rôle privilégié ne change pas le numéro (trigger)');

\echo '== 5. Acceptation des règles obligatoire'
select tests.login('carol');
select tests.err($q$select public.start_conversation(tests.uid('bob'))$q$, 'rules_required', 'sans règles : pas de conversation');
select tests.err($q$insert into public.help_requests (title, description, category) values ('Titre valide', 'Description assez longue', 'autre')$q$,
                 'row-level security', 'sans règles : pas de demande d''aide');
select tests.err($q$select public.accept_rules('1999-01-01')$q$, 'invalid_rules_version', 'version des règles invalide');
select public.accept_rules('2026-10-17');
select tests.ok((select rules_accepted_at is not null from public.user_settings where user_id = tests.uid('carol')), 'carol accepte les règles');
select tests.logout();

\echo '== 6. Conversations privées'
select tests.login('alice');
create temp table ctx (conv uuid);
grant all on ctx to public;
insert into ctx select public.start_conversation(tests.uid('bob'));
select tests.ok((select conv from ctx) is not null, 'alice démarre une conversation avec bob');
select tests.ok(public.start_conversation(tests.uid('bob')) = (select conv from ctx), 'idempotent : même conversation');
select tests.err($q$select public.start_conversation(tests.uid('alice'))$q$, 'invalid_target', 'pas de conversation avec soi-même');
select tests.err($q$select public.start_conversation(gen_random_uuid())$q$, 'contact_unavailable', 'destinataire inexistant');
select tests.err($q$insert into public.conversations (user_a, user_b) values (tests.uid('alice'), tests.uid('carol'))$q$, 'permission denied', 'pas de création directe de conversation');
select tests.logout();
select tests.login('bob');
select tests.ok(public.start_conversation(tests.uid('alice')) = (select conv from ctx), 'bob retrouve la même conversation (une seule par paire)');
select tests.logout();
select tests.ok((select user_a < user_b from public.conversations), 'paire ordonnée');

\echo '== 7. Messages : lecture réservée aux participants'
select tests.login('alice');
insert into ctx select public.send_message((select conv from ctx limit 1), '  Bonjour Bob !  ');
select tests.err($q$select public.send_message((select conv from ctx limit 1), '   ')$q$, 'empty_message', 'message vide refusé');
select tests.err($q$select public.send_message((select conv from ctx limit 1), repeat('a', 2001))$q$, 'message_too_long', 'message trop long refusé');
select tests.err($q$insert into public.messages (conversation_id, sender_id, content) values ((select conv from ctx limit 1), tests.uid('alice'), 'direct')$q$, 'permission denied', 'pas d''insertion directe (contourne les contrôles)');
select tests.err($q$update public.messages set content = 'modifié'$q$, 'permission denied', 'messages non modifiables');
select tests.ok(tests.count($q$select * from public.messages$q$) = 1, 'alice voit son message');
select tests.ok((select content from public.messages limit 1) = 'Bonjour Bob !', 'contenu nettoyé');
select tests.logout();

select tests.login('bob');
select tests.ok(tests.count($q$select * from public.messages$q$) = 1, 'bob voit le message');
select tests.ok((select unread_count from public.list_conversations()) = 1, 'bob : 1 message non lu');
select public.mark_read((select conv from ctx limit 1));
select tests.ok((select unread_count from public.list_conversations()) = 0, 'bob : lu');
select tests.ok(tests.rows($q$delete from public.messages$q$) = 0, 'bob ne supprime pas le message d''alice');
select tests.logout();

select tests.login('carol');
select tests.ok(tests.count($q$select * from public.messages$q$) = 0, 'carol (extérieure) ne lit AUCUN message');
select tests.ok(tests.count($q$select * from public.conversations$q$) = 0, 'carol ne voit pas la conversation');
select tests.ok(tests.count($q$select * from public.list_conversations()$q$) = 0, 'carol : liste de conversations vide');
select tests.err($q$select public.send_message((select conv from ctx limit 1), 'intrusion')$q$, 'not_member', 'carol ne peut pas écrire dans la conversation');
select tests.err($q$insert into public.messages (conversation_id, sender_id, content) values ((select conv from ctx limit 1), tests.uid('carol'), 'x')$q$, 'permission denied', 'carol : insertion directe refusée');
select tests.ok(tests.count($q$select * from public.message_attachments$q$) = 0, 'carol ne voit aucune pièce jointe');
select tests.logout();

select tests.login('bob');
select public.send_message((select conv from ctx limit 1), 'Salut Alice');
select tests.logout();
select tests.login('alice');
select tests.ok((select unread_count from public.list_conversations()) = 1, 'alice : 1 message non lu (réponse de bob)');
select tests.ok((select other_public_id from public.list_conversations()) = 'User#0002', 'la liste identifie clairement l''interlocuteur');
select tests.logout();

\echo '== 8. Pièces jointes : type et taille contrôlés côté serveur'
-- On simule ce que fait l'API de stockage : un objet est créé (par alice) avec ses métadonnées réelles.
create temp table objs (name text, kind text);
grant all on objs to public;
insert into objs values
  ((select conv from ctx limit 1) || '/' || gen_random_uuid() || '.png', 'ok-image'),
  ((select conv from ctx limit 1) || '/' || gen_random_uuid() || '.png', 'big-image'),
  ((select conv from ctx limit 1) || '/' || gen_random_uuid() || '.mp4', 'ok-video'),
  ((select conv from ctx limit 1) || '/' || gen_random_uuid() || '.mp4', 'big-video'),
  ((select conv from ctx limit 1) || '/' || gen_random_uuid() || '.pdf', 'pdf'),
  ((select conv from ctx limit 1) || '/' || gen_random_uuid() || '.png', 'bobs');
insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'chat-media', name,
       case when kind = 'bobs' then tests.uid('bob')::text else tests.uid('alice')::text end,
       case kind when 'ok-image'  then '{"size": 1000000,  "mimetype": "image/png"}'
                 when 'big-image' then '{"size": 6000000,  "mimetype": "image/png"}'
                 when 'ok-video'  then '{"size": 15000000, "mimetype": "video/mp4"}'
                 when 'big-video' then '{"size": 25000000, "mimetype": "video/mp4"}'
                 when 'pdf'       then '{"size": 1000,     "mimetype": "application/pdf"}'
                 else                  '{"size": 1000,     "mimetype": "image/png"}' end::jsonb
  from objs;

select tests.login('alice');
select tests.err(format($q$select public.send_message(%L, '', jsonb_build_array(jsonb_build_object('path', %L, 'name', 'gros.png')))$q$,
        (select conv from ctx limit 1), (select name from objs where kind = 'big-image')), 'file_too_large', 'image > 5 Mo refusée');
select tests.err(format($q$select public.send_message(%L, '', jsonb_build_array(jsonb_build_object('path', %L, 'name', 'gros.mp4')))$q$,
        (select conv from ctx limit 1), (select name from objs where kind = 'big-video')), 'file_too_large', 'vidéo > 20 Mo refusée');
select tests.err(format($q$select public.send_message(%L, '', jsonb_build_array(jsonb_build_object('path', %L, 'name', 'doc.pdf')))$q$,
        (select conv from ctx limit 1), (select name from objs where kind = 'pdf')), 'file_type_not_allowed', 'PDF refusé (type non autorisé)');
select tests.err(format($q$select public.send_message(%L, '', jsonb_build_array(jsonb_build_object('path', %L, 'name', 'x.png')))$q$,
        (select conv from ctx limit 1), (select name from objs where kind = 'bobs')), 'attachment_not_found', 'on ne peut pas s''approprier le fichier d''un autre');
select tests.err(format($q$select public.send_message(%L, '', jsonb_build_array(jsonb_build_object('path', %L, 'name', 'x.png')))$q$,
        (select conv from ctx limit 1), (select conv from ctx limit 1) || '/inexistant.png'), 'invalid_attachment_path', 'chemin invalide refusé');
select tests.err(format($q$select public.send_message(%L, '', jsonb_build_array(jsonb_build_object('path', %L, 'name', 'x.png')))$q$,
        (select conv from ctx limit 1), gen_random_uuid() || '/' || gen_random_uuid() || '.png'), 'invalid_attachment_path', 'fichier d''une autre conversation refusé');
select tests.err(format($q$select public.send_message(%L, '', jsonb_build_array(jsonb_build_object('path', %L, 'name', 'x.png')))$q$,
        (select conv from ctx limit 1), (select conv from ctx limit 1) || '/' || gen_random_uuid() || '.png'), 'attachment_not_found', 'fichier absent du stockage refusé');
select tests.err(format($q$select public.send_message(%L, '', jsonb_build_array(jsonb_build_object('path', %L, 'name', 'x'), jsonb_build_object('path', %L, 'name', 'x'), jsonb_build_object('path', %L, 'name', 'x'), jsonb_build_object('path', %L, 'name', 'x'), jsonb_build_object('path', %L, 'name', 'x')))$q$,
        (select conv from ctx limit 1), 'a', 'b', 'c', 'd', 'e'), 'too_many_attachments', 'maximum 4 pièces jointes');

create temp table att_msgs (id uuid);
grant all on att_msgs to public;
insert into att_msgs select public.send_message((select conv from ctx limit 1), 'Voici une image',
  jsonb_build_array(jsonb_build_object('path', (select name from objs where kind = 'ok-image'), 'name', 'photo.png')));
insert into att_msgs select public.send_message((select conv from ctx limit 1), '',
  jsonb_build_array(jsonb_build_object('path', (select name from objs where kind = 'ok-video'), 'name', 'clip.mp4')));
select tests.ok((select count(*) from att_msgs) = 2, 'image 1 Mo et vidéo 15 Mo acceptées');
select tests.err(format($q$select public.send_message(%L, 'encore', jsonb_build_array(jsonb_build_object('path', %L, 'name', 'photo.png')))$q$,
        (select conv from ctx limit 1), (select name from objs where kind = 'ok-image')), 'duplicate key', 'un fichier ne se réutilise pas');
select tests.ok(tests.count($q$select * from public.message_attachments$q$) = 2, 'alice voit ses 2 pièces jointes');
select tests.ok((select mime_type from public.message_attachments order by file_size limit 1) = 'image/png', 'type enregistré depuis le stockage');
select tests.logout();
select tests.login('bob');
select tests.ok(tests.count($q$select * from public.message_attachments$q$) = 2, 'bob voit les pièces jointes');
select tests.logout();
select tests.login('carol');
select tests.ok(tests.count($q$select * from public.message_attachments$q$) = 0, 'carol ne voit aucune pièce jointe');
select tests.logout();

\echo '== 9. Règles du stockage (policies storage.objects)'
select tests.login('alice');
select tests.ok(tests.rows(format($q$insert into storage.objects (bucket_id, name, owner_id, metadata) values ('chat-media', %L, %L, '{}')$q$,
        (select conv from ctx limit 1) || '/' || gen_random_uuid() || '.png', tests.uid('alice')::text)) = 1, 'alice peut déposer dans sa conversation');
select tests.err(format($q$insert into storage.objects (bucket_id, name, owner_id) values ('chat-media', %L, %L)$q$,
        gen_random_uuid() || '/' || gen_random_uuid() || '.png', tests.uid('alice')::text), 'row-level security', 'pas de dépôt dans une conversation inconnue');
select tests.err(format($q$insert into storage.objects (bucket_id, name, owner_id) values ('chat-media', %L, %L)$q$,
        'dossier-libre/' || gen_random_uuid() || '.png', tests.uid('alice')::text), 'row-level security', 'dossier non-uuid refusé');
select tests.ok(tests.rows(format($q$insert into storage.objects (bucket_id, name, owner_id) values ('avatars', %L, %L)$q$,
        tests.uid('alice') || '/avatar.png', tests.uid('alice')::text)) = 1, 'avatar dans son propre dossier');
select tests.err(format($q$insert into storage.objects (bucket_id, name, owner_id) values ('avatars', %L, %L)$q$,
        tests.uid('bob') || '/avatar.png', tests.uid('alice')::text), 'row-level security', 'avatar dans le dossier d''un autre refusé');
select tests.ok(tests.rows(format($q$insert into storage.objects (bucket_id, name, owner_id) values ('help-images', %L, %L)$q$,
        tests.uid('alice') || '/probleme.png', tests.uid('alice')::text)) = 1, 'image de demande d''aide dans son dossier');
select tests.err(format($q$insert into storage.objects (bucket_id, name, owner_id) values ('help-images', %L, %L)$q$,
        tests.uid('bob') || '/probleme.png', tests.uid('alice')::text), 'row-level security', 'image d''aide dans le dossier d''un autre refusée');
select tests.ok(tests.rows(format($q$delete from storage.objects where bucket_id = 'chat-media' and name = %L$q$,
        (select name from objs where kind = 'bobs'))) = 0, 'alice ne supprime pas le fichier de bob');
select tests.logout();
select tests.login('bob');
select tests.ok(tests.count($q$select * from storage.objects where bucket_id = 'chat-media'$q$) >= 5, 'bob lit les fichiers de sa conversation');
select tests.logout();
select tests.login('carol');
select tests.ok(tests.count($q$select * from storage.objects where bucket_id = 'chat-media'$q$) = 0, 'carol ne lit AUCUN fichier de la conversation');
select tests.err(format($q$insert into storage.objects (bucket_id, name, owner_id) values ('chat-media', %L, %L)$q$,
        (select conv from ctx limit 1) || '/' || gen_random_uuid() || '.png', tests.uid('carol')::text), 'row-level security', 'carol ne dépose rien chez les autres');
select tests.logout();
select tests.ok((select allowed_mime_types @> array['image/png','video/mp4'] and not allowed_mime_types @> array['image/svg+xml', 'text/html']
                   from storage.buckets where id = 'chat-media'), 'chat-media : ni SVG ni HTML');
select tests.ok((select not public from storage.buckets where id in ('chat-media') ) , 'chat-media est privé');

\echo '== 10. Blocage'
select tests.login('bob');
select tests.err($q$insert into public.user_blocks (blocker_id, blocked_id) values (tests.uid('carol'), tests.uid('alice'))$q$, 'permission denied', 'on ne bloque pas au nom d''un autre');
select tests.err($q$insert into public.user_blocks (blocked_id) values (tests.uid('bob'))$q$, 'row-level security', 'on ne se bloque pas soi-même');
insert into public.user_blocks (blocked_id) values (tests.uid('alice'));
select tests.ok(tests.count($q$select * from public.user_blocks$q$) = 1, 'bob bloque alice');
select tests.err($q$select public.send_message((select conv from ctx limit 1), 'je bloque et j''écris')$q$, 'contact_unavailable', 'le bloqueur doit d''abord débloquer');
insert into public.help_requests (title, description, category) values ('Aide avec mon imprimante', 'Elle ne se connecte plus au wifi', 'ordinateur');
select tests.logout();

select tests.login('alice');
select tests.err($q$select public.send_message((select conv from ctx limit 1), 'Tu me réponds ?')$q$, 'contact_unavailable', 'alice bloquée : envoi refusé');
select tests.err($q$select public.start_conversation(tests.uid('bob'))$q$, 'contact_unavailable', 'alice bloquée : pas de nouvelle conversation');
select tests.ok(tests.count($q$select * from public.search_profiles('User#0002')$q$) = 0, 'alice bloquée : bob introuvable');
select tests.ok(tests.count($q$select * from public.user_blocks$q$) = 0, 'alice ne voit pas qu''elle est bloquée');
select tests.ok(tests.count($q$select * from public.help_requests where author_id = tests.uid('bob')$q$) = 0, 'alice bloquée : demandes de bob masquées');
select tests.ok(tests.count($q$select * from public.messages$q$) >= 3, 'alice garde l''accès à l''historique');
select tests.err(format($q$insert into storage.objects (bucket_id, name, owner_id) values ('chat-media', %L, %L)$q$,
        (select conv from ctx limit 1) || '/' || gen_random_uuid() || '.png', tests.uid('alice')::text), 'row-level security', 'alice bloquée : dépôt de fichier refusé');
select tests.logout();

select tests.login('bob');
delete from public.user_blocks where blocked_id = tests.uid('alice');
select tests.logout();
select tests.login('alice');
select tests.ok(public.send_message((select conv from ctx limit 1), 'Merci de m''avoir débloquée') is not null, 'après déblocage : envoi possible');
select tests.logout();

\echo '== 11. Confidentialité : contacts refusés, profil non recherchable'
select tests.login('carol');
update public.user_settings set allow_contact = false where user_id = tests.uid('carol');
select tests.logout();
select tests.login('bob');
select tests.err($q$select public.start_conversation(tests.uid('carol'))$q$, 'contact_unavailable', 'contacts refusés par carol');
select tests.ok((select can_contact from public.search_profiles('User#0003')) is false, 'la recherche indique « non contactable »');
select tests.logout();
select tests.login('carol');
update public.user_settings set searchable = false where user_id = tests.uid('carol');
select tests.logout();
select tests.login('bob');
select tests.ok(tests.count($q$select * from public.search_profiles('User#0003')$q$) = 0, 'carol non recherchable : introuvable');
select tests.logout();
select tests.login('carol');
update public.user_settings set allow_contact = true, searchable = true where user_id = tests.uid('carol');
select tests.logout();

\echo '== 12. Signalements'
select tests.login('bob');
create temp table rep (id uuid);
grant all on rep to public;
insert into rep select public.report_content('message', (select id from public.messages where sender_id = tests.uid('alice') limit 1), 'harcelement', 'Détails du signalement');
select tests.ok((select id from rep) is not null, 'bob signale un message d''alice');
select tests.ok(public.report_content('message', (select id from public.messages where sender_id = tests.uid('alice') limit 1), 'spam') = (select id from rep), 'pas de doublon de signalement');
select tests.err($q$select public.report_content('message', (select id from public.messages where sender_id = tests.uid('bob') limit 1), 'spam')$q$, 'cannot_report_self', 'on ne se signale pas soi-même');
select tests.err($q$select public.report_content('message', gen_random_uuid(), 'spam')$q$, 'target_not_found', 'cible inexistante');
select tests.err($q$select public.report_content('message', (select id from public.messages limit 1), 'nimportequoi')$q$, 'invalid_reason', 'motif invalide');
select tests.ok(public.report_content('profile', tests.uid('alice'), 'usurpation') is not null, 'signalement de profil');
select tests.ok(tests.count($q$select * from public.reports$q$) = 0, 'bob ne relit pas les signalements');
select tests.logout();
select tests.login('carol');
select tests.err($q$select public.report_content('message', (select id from public.messages limit 1), 'spam')$q$, 'target_not_found', 'carol ne signale pas un message qu''elle ne peut pas voir');
select tests.ok(tests.count($q$select * from public.reports$q$) = 0, 'carol (non modératrice) ne voit aucun signalement');
select tests.logout();
select tests.ok((select reporter_id = tests.uid('bob') and reported_public_id = 'User#0001' and status = 'open'
                        and content_snapshot like 'Bonjour Bob%' and reason = 'harcelement' and created_at is not null
                   from public.reports where id = (select id from rep)), 'signalement complet : auteur, cible, motif, date, statut, extrait');
insert into private.moderators values (tests.uid('carol'));
select tests.login('carol');
select tests.ok(tests.count($q$select * from public.reports$q$) = 2, 'une modératrice voit les signalements');
select tests.ok(tests.rows($q$update public.reports set status = 'resolved' where reason = 'usurpation'$q$) = 1, 'une modératrice traite un signalement');
select tests.err($q$update public.reports set reason = 'spam'$q$, 'permission denied', 'seul le statut est modifiable');
select tests.logout();
select tests.login('alice');
select tests.ok(tests.rows($q$update public.reports set status = 'dismissed'$q$) = 0, 'alice ne traite pas les signalements');
select tests.ok(not public.am_i_moderator(), 'am_i_moderator : alice n''est pas modératrice');
select tests.logout();
select tests.login('carol');
select tests.ok(public.am_i_moderator(), 'am_i_moderator : carol est modératrice');
select tests.ok(tests.count($q$select r.id, p.public_id from public.reports r join public.profiles p on p.id = r.reporter_id$q$) = 2, 'une modératrice voit l''identifiant public de l''auteur des signalements');
select tests.logout();
set role anon;
select tests.err($q$select public.am_i_moderator()$q$, 'permission denied', 'anon ne peut pas appeler am_i_moderator');
reset role;

\echo '== 13. Demandes d''aide'
select tests.login('alice');
insert into public.help_requests (title, description, category) values ('Impossible d''envoyer un PDF', 'Mon fichier est trop lourd pour mon mail', 'bureautique');
select tests.ok((select author_id from public.help_requests where title like 'Impossible%') = tests.uid('alice'), 'auteur = utilisateur connecté');
select tests.ok((select status from public.help_requests where title like 'Impossible%') = 'open', 'statut initial : ouverte');
select tests.err($q$insert into public.help_requests (author_id, title, description, category) values (tests.uid('bob'), 'Titre valide', 'Description assez longue', 'autre')$q$, 'permission denied', 'usurpation d''auteur refusée');
select tests.err($q$insert into public.help_requests (title, description, category) values ('Titre valide', 'Description assez longue', 'pirate')$q$, 'violates check constraint', 'catégorie invalide');
select tests.err($q$insert into public.help_requests (title, description, category) values ('abc', 'Description assez longue', 'autre')$q$, 'violates check constraint', 'titre trop court');
select tests.err(format($q$insert into public.help_requests (title, description, category, image_path) values ('Titre valide', 'Description assez longue', 'autre', %L)$q$, tests.uid('bob') || '/x.png'),
                 'violates check constraint', 'image dans le dossier d''un autre refusée');
select tests.ok(tests.rows($q$update public.help_requests set status = 'resolved' where title like 'Impossible%'$q$) = 1, 'l''auteur change le statut');
select tests.logout();
select tests.login('carol');
select tests.ok(tests.count($q$select * from public.help_requests$q$) >= 2, 'les membres connectés consultent les demandes');
select tests.ok(tests.rows($q$update public.help_requests set status = 'open'$q$) = 0, 'carol ne modifie pas les demandes des autres');
select tests.ok(tests.rows($q$delete from public.help_requests$q$) = 0, 'carol ne supprime pas les demandes des autres');
select tests.logout();
select tests.login('alice');
select tests.ok(tests.rows($q$delete from public.help_requests where title like 'Impossible%'$q$) = 1, 'l''auteur supprime sa demande');
select tests.logout();

\echo '== 14. Limitation de débit (anti-abus)'
delete from private.rate_events;
select tests.login('alice');
do $$
declare v_ok integer := 0; v_last text;
begin
  for i in 1..40 loop
    begin
      perform public.send_message((select conv from ctx limit 1), 'spam ' || i);
      v_ok := v_ok + 1;
    exception when others then v_last := sqlerrm; exit;
    end;
  end loop;
  perform tests.ok(v_ok = 30 and v_last = 'rate_limited', format('messages : 30 par minute puis blocage (%s envoyés, erreur « %s »)', v_ok, v_last));
end $$;
select tests.logout();
delete from private.rate_events;
select tests.login('bob');
do $$
declare v_ok integer := 0; v_last text;
begin
  for i in 1..40 loop
    begin
      perform count(*) from public.search_profiles('User#0001');
      v_ok := v_ok + 1;
    exception when others then v_last := sqlerrm; exit;
    end;
  end loop;
  perform tests.ok(v_ok = 30 and v_last = 'rate_limited', format('recherches : 30 par minute puis blocage (%s, « %s »)', v_ok, v_last));
end $$;
select tests.logout();
delete from private.rate_events;

\echo '== 15. Suppression de compte et identifiants jamais réutilisés'
insert into auth.users (id, email, raw_user_meta_data) values
  (tests.uid('dave'), 'dave@example.org', '{"rules_version":"2026-10-17"}');
select tests.ok((select public_id from public.profiles where id = tests.uid('dave')) = 'User#0004', 'dave = User#0004');
select tests.login('dave');
create temp table dconv (id uuid);
grant all on dconv to public;
insert into dconv select public.start_conversation(tests.uid('alice'));
select public.send_message((select id from dconv), 'Bonjour Alice, je suis Dave');
select public.report_content('profile', tests.uid('alice'), 'autre', 'test');
select tests.logout();
select tests.login('dave');
select public.delete_my_account();
select tests.logout();
select tests.ok(not exists (select 1 from public.profiles where id = tests.uid('dave')), 'profil supprimé');
select tests.ok(not exists (select 1 from public.messages where conversation_id = (select id from dconv)), 'messages supprimés en cascade');
select tests.ok(not exists (select 1 from public.conversations where id = (select id from dconv)), 'conversation supprimée');
select tests.ok(exists (select 1 from public.reports where reporter_id is null and reported_public_id = 'User#0001' and details = 'test'), 'le signalement est conservé (auteur anonymisé)');
insert into auth.users (id, email, raw_user_meta_data) values (tests.uid('erin'), 'erin@example.org', '{}');
select tests.ok((select public_id from public.profiles where id = tests.uid('erin')) = 'User#0005', 'User#0004 n''est pas réattribué (erin = User#0005)');

\echo '== 16. Format des grands numéros'
select setval('public.public_number_seq', 9998);
insert into auth.users (id, email) values (tests.uid('frank'), 'frank@example.org');
select tests.ok((select public_id from public.profiles where id = tests.uid('frank')) = 'User#9999', 'User#9999');
insert into auth.users (id, email) values (gen_random_uuid(), 'g@example.org');
select tests.ok(exists (select 1 from public.profiles where public_id = 'User#10000'), 'User#10000 (5 chiffres, sans troncature)');
select tests.ok((select count(*) = count(distinct public_id) from public.profiles), 'tous les identifiants restent uniques');

\echo '== 17. Contrôle de couverture : RLS activée partout'
select tests.ok(not exists (select 1 from pg_tables t join pg_class c on c.relname = t.tablename
                              join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
                             where t.schemaname = 'public' and not c.relrowsecurity), 'RLS activée sur toutes les tables publiques');
select tests.ok(not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and grantee = 'anon'), 'anon : aucun droit sur les tables publiques');
select tests.ok(not exists (select 1 from information_schema.routine_privileges
                             where routine_schema = 'public' and grantee in ('anon', 'PUBLIC')), 'anon/PUBLIC : aucune fonction publique exécutable');
\echo '✔ Fin des tests SQL'

-- =====================================================================
-- Coup de Pouce by EITT — 1/3 : schéma (tables, contraintes, triggers)
-- À exécuter dans l'éditeur SQL de Supabase (ou via `supabase db push`).
-- Les droits d'accès (RLS, GRANT) sont dans 20261017000002_security.sql.
-- =====================================================================

-- Schéma interne : NON exposé par l'API (PostgREST). Contient les fonctions
-- d'aide aux politiques RLS, le suivi anti-abus et la liste des modérateurs.
create schema if not exists private;

-- Version des règles de la communauté (à incrémenter quand elles changent :
-- tous les comptes devront alors les accepter à nouveau pour écrire).
create or replace function private.current_rules_version()
returns text language sql immutable as $$ select '2026-10-17'::text $$;

-- ---------------------------------------------------------------------
-- Profils publics : identifiant interne (uuid) + identifiant public User#0001
-- ---------------------------------------------------------------------
create sequence if not exists public.public_number_seq as integer minvalue 1;

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  -- Numéro attribué par la base (séquence) : unique, jamais réutilisé, jamais choisi par le client.
  public_number integer not null unique default nextval('public.public_number_seq'),
  -- User#0001 … User#9999, puis User#10000 … (colonne calculée : impossible à modifier).
  public_id     text generated always as (
                  'User#' || case when public_number < 10000
                                  then lpad(public_number::text, 4, '0')
                                  else public_number::text end
                ) stored,
  display_name  text check (display_name is null or char_length(display_name) between 1 and 40),
  avatar_path   text check (avatar_path is null
                            or (char_length(avatar_path) <= 200 and avatar_path like id::text || '/%')),
  bio           text check (bio is null or char_length(bio) <= 300),
  created_at    timestamptz not null default now(),
  constraint profiles_public_id_key unique (public_id)
);

-- Réglages privés (visibles uniquement par leur propriétaire) : apparence,
-- notifications, confidentialité, acceptation des règles.
create table public.user_settings (
  user_id                  uuid primary key references public.profiles (id) on delete cascade,
  theme                    text not null default 'eitt' check (theme in ('light', 'dark', 'eitt', 'custom')),
  theme_custom             jsonb not null default '{}'::jsonb
                             check (jsonb_typeof(theme_custom) = 'object' and pg_column_size(theme_custom) < 2000),
  -- Tout est désactivé par défaut, sauf le petit indicateur discret dans l'interface.
  notification_preferences jsonb not null default jsonb_build_object(
                             'inapp_indicator', true,
                             'event_messages', true,
                             'event_help_requests', false,
                             'sound', false,
                             'visual_alerts', false,
                             'browser', false,
                             'email', false)
                             check (jsonb_typeof(notification_preferences) = 'object'
                                    and pg_column_size(notification_preferences) < 2000),
  allow_contact            boolean not null default true,  -- accepte de nouvelles conversations
  searchable               boolean not null default true,  -- retrouvable par recherche d'identifiant exact
  rules_accepted_at        timestamptz,
  rules_version            text,
  updated_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Entraide
-- ---------------------------------------------------------------------
create table public.help_requests (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 5 and 120),
  description text not null check (char_length(btrim(description)) between 10 and 2000),
  category    text not null check (category in ('ordinateur', 'smartphone', 'internet', 'logiciels',
                'cybersecurite', 'demarches', 'bureautique', 'programmation', 'ia', 'autre')),
  status      text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  image_path  text check (image_path is null
                          or (char_length(image_path) <= 200 and image_path like author_id::text || '/%')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index help_requests_created_idx  on public.help_requests (created_at desc);
create index help_requests_category_idx on public.help_requests (category);
create index help_requests_author_idx   on public.help_requests (author_id);

-- ---------------------------------------------------------------------
-- Messagerie privée (conversations à deux : user_a < user_b => une seule par paire)
-- ---------------------------------------------------------------------
create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  user_a           uuid not null references public.profiles (id) on delete cascade,
  user_b           uuid not null references public.profiles (id) on delete cascade,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz,
  user_a_read_at   timestamptz not null default now(),
  user_b_read_at   timestamptz not null default now(),
  user_a_archived  boolean not null default false,
  user_b_archived  boolean not null default false,
  constraint conversations_ordered check (user_a < user_b),
  constraint conversations_pair_unique unique (user_a, user_b)
);
create index conversations_user_b_idx on public.conversations (user_b);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  content         text not null default '' check (char_length(content) <= 2000),
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.message_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages (id) on delete cascade,
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  file_name    text not null check (char_length(file_name) <= 120),
  mime_type    text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif',
                                                  'video/mp4', 'video/webm')),
  file_size    integer not null check (file_size > 0 and file_size <= 20971520),
  created_at   timestamptz not null default now()
);
create index message_attachments_message_idx on public.message_attachments (message_id);
create index message_attachments_owner_idx   on public.message_attachments (owner_id);

-- ---------------------------------------------------------------------
-- Blocage et signalement
-- ---------------------------------------------------------------------
create table public.user_blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- Les signalements survivent à la suppression des comptes/contenus (preuve) :
-- on conserve un instantané du contenu et de l'identifiant public concerné.
create table public.reports (
  id                 uuid primary key default gen_random_uuid(),
  reporter_id        uuid references public.profiles (id) on delete set null,
  reported_user_id   uuid references public.profiles (id) on delete set null,
  reported_public_id text,
  message_id         uuid references public.messages (id) on delete set null,
  help_request_id    uuid references public.help_requests (id) on delete set null,
  reason             text not null check (reason in ('harcelement', 'arnaque', 'donnees_personnelles',
                       'contenu_inapproprie', 'spam', 'usurpation', 'autre')),
  details            text check (details is null or char_length(details) <= 1000),
  content_snapshot   text check (content_snapshot is null or char_length(content_snapshot) <= 2200),
  status             text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  created_at         timestamptz not null default now()
);
create index reports_status_idx on public.reports (status, created_at desc);

-- ---------------------------------------------------------------------
-- Tables internes (schéma private) : anti-abus et modération
-- ---------------------------------------------------------------------
create table private.rate_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  kind       text not null,
  created_at timestamptz not null default now()
);
create index rate_events_lookup_idx on private.rate_events (user_id, kind, created_at desc);

-- Les modérateurs sont ajoutés à la main (voir README) : aucune interface publique ne peut s'en servir.
create table private.moderators (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger help_requests_touch before update on public.help_requests
  for each row execute function private.touch_updated_at();
create trigger user_settings_touch before update on public.user_settings
  for each row execute function private.touch_updated_at();

-- Défense en profondeur : le numéro public ne change jamais, même pour un rôle privilégié par erreur.
create or replace function private.profiles_immutable()
returns trigger language plpgsql as $$
begin
  if new.id is distinct from old.id or new.public_number is distinct from old.public_number then
    raise exception 'immutable_identifier';
  end if;
  return new;
end $$;
create trigger profiles_immutable before update on public.profiles
  for each row execute function private.profiles_immutable();

-- Création automatique du profil et des réglages à l'inscription.
-- L'identifiant public vient de la séquence de la base (jamais du navigateur).
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name  text := nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 40), '');
  v_rules text := new.raw_user_meta_data ->> 'rules_version';
  v_ok    boolean := v_rules is not distinct from private.current_rules_version();
begin
  insert into public.profiles (id, display_name) values (new.id, v_name);
  insert into public.user_settings (user_id, rules_accepted_at, rules_version)
  values (new.id, case when v_ok then now() end, case when v_ok then v_rules end);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Limitation de débit : refuse si l'utilisateur a déjà fait p_max actions de ce type dans la fenêtre.
create or replace function private.check_rate(p_kind text, p_max integer, p_window interval)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_n   integer;
begin
  if v_uid is null then return; end if;  -- opérations d'administration (SQL editor, service_role)
  select count(*) into v_n from private.rate_events
   where user_id = v_uid and kind = p_kind and created_at > now() - p_window;
  if v_n >= p_max then
    raise exception 'rate_limited';
  end if;
  insert into private.rate_events (user_id, kind) values (v_uid, p_kind);
  delete from private.rate_events where user_id = v_uid and created_at < now() - interval '1 day';
end $$;

create or replace function private.help_requests_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_rate('help_request', 10, interval '1 hour');
  return new;
end $$;
create trigger help_requests_rate before insert on public.help_requests
  for each row execute function private.help_requests_before_insert();

-- ---------------------------------------------------------------------
-- Fonctions d'aide pour les politiques RLS (security definer, schéma private)
-- ---------------------------------------------------------------------
create or replace function private.is_member(p_conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations c
                  where c.id = p_conv and auth.uid() in (c.user_a, c.user_b));
$$;

create or replace function private.is_blocked_between(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_blocks b
                  where (b.blocker_id = p_a and b.blocked_id = p_b)
                     or (b.blocker_id = p_b and b.blocked_id = p_a));
$$;

create or replace function private.rules_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_settings s
                  where s.user_id = auth.uid()
                    and s.rules_version = private.current_rules_version());
$$;

create or replace function private.can_post_in(p_conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.rules_ok()
     and exists (select 1 from public.conversations c
                  where c.id = p_conv
                    and auth.uid() in (c.user_a, c.user_b)
                    and not private.is_blocked_between(c.user_a, c.user_b));
$$;

create or replace function private.is_moderator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.moderators m where m.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Temps réel (messages et demandes d'aide) — la publication existe sur Supabase.
-- Les événements respectent les politiques RLS de lecture.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
    alter publication supabase_realtime add table public.help_requests;
  end if;
end $$;

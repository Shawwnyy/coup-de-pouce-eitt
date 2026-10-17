-- =====================================================================
-- Coup de Pouce by EITT — 4/4 : écran de modération
-- À exécuter APRÈS les migrations 1, 2 et 3.
-- =====================================================================
-- L'application a besoin de savoir si le compte connecté est modérateur pour afficher (ou non) l'écran
-- « Modération ». La vraie protection reste la RLS de public.reports : un non-modérateur ne peut de toute
-- façon rien lire ni modifier, même s'il appelle l'API à la main.
create or replace function public.am_i_moderator()
returns boolean
language sql stable security invoker set search_path = '' as $$
  select private.is_moderator();
$$;

revoke all on function public.am_i_moderator() from public, anon;
grant execute on function public.am_i_moderator() to authenticated;

-- Les modérateurs doivent pouvoir afficher le pseudo/identifiant de l'auteur d'un signalement et de la cible :
-- la lecture de public.profiles est déjà accordée à tous les membres connectés (aucune donnée privée dedans).

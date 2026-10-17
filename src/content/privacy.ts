/**
 * Texte de la page « Confidentialité ». Il décrit ce que l'application fait RÉELLEMENT des données.
 * Les éléments propres à l'association (responsable, hébergeur, durées, contact) sont à compléter :
 * ils sont repérés par le marqueur TODO ci-dessous, et un bandeau reste affiché tant que
 * LEGAL_COMPLETED vaut false dans src/lib/config.ts. Ce texte n'est pas un avis juridique.
 */
export const TODO = '[À compléter par l’association]'

export interface PrivacySection {
  id: string
  title: string
  paragraphs?: string[]
  items?: string[]
}

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    id: 'donnees',
    title: 'Les données que nous enregistrons',
    items: [
      'Votre adresse e-mail : utilisée uniquement pour la connexion et pour les messages de sécurité (confirmation du compte, réinitialisation du mot de passe). Elle n’est jamais affichée aux autres membres.',
      'Votre mot de passe : il n’est jamais lisible, ni par nous ni par les autres (il est transformé par le service d’authentification Supabase).',
      'Votre identifiant public (User#0001…), attribué automatiquement, qui ne change jamais.',
      'Facultatif : votre nom d’affichage, votre présentation et votre photo de profil. Ils sont visibles par les membres connectés ; la photo est servie par une adresse publique.',
      'Vos messages privés et les fichiers que vous joignez (images, GIF, vidéos). Ils ne sont lisibles que par les deux personnes de la conversation. Ils ne sont pas chiffrés de bout en bout : les personnes qui administrent la base de données de ce service peuvent techniquement y accéder.',
      'Vos demandes d’aide (titre, description, catégorie, image facultative), visibles par les membres connectés.',
      'Vos réglages (thème, notifications, confidentialité) et la liste des personnes que vous avez bloquées.',
      'Les signalements que vous faites : motif, précisions, date et un extrait du contenu signalé. Ils ne sont lisibles que par les personnes désignées comme modératrices ou modérateurs.',
    ],
  },
  {
    id: 'navigateur',
    title: 'Ce qui reste dans votre navigateur',
    paragraphs: [
      'Aucun cookie publicitaire, aucun outil de mesure d’audience, aucun traceur tiers.',
      'Le navigateur garde uniquement ce qui est nécessaire au fonctionnement : votre session de connexion et vos préférences d’affichage. Votre image de fond personnalisée reste exclusivement sur votre appareil : elle n’est jamais envoyée ni rendue publique.',
    ],
  },
  {
    id: 'visibilite',
    title: 'Qui peut voir quoi',
    items: [
      'Tout le monde (sans compte) : l’accueil, les règles, cette page.',
      'Les membres connectés : les profils publics (identifiant, nom d’affichage, présentation, photo) et les demandes d’aide. Vous pouvez, dans Paramètres > Confidentialité, ne plus apparaître dans la recherche et refuser les nouvelles conversations.',
      'Les deux personnes d’une conversation : les messages et fichiers de cette conversation.',
      'Les modératrices et modérateurs désignés : les signalements.',
    ],
  },
  {
    id: 'droits',
    title: 'Vos droits et comment les exercer',
    items: [
      'Accéder à vos données : Paramètres > Compte > « Télécharger mes données » (fichier JSON fabriqué dans votre navigateur).',
      'Corriger vos informations : Paramètres > Profil.',
      'Supprimer votre compte et vos données : Paramètres > Compte > « Supprimer mon compte ». La suppression est définitive ; votre identifiant public n’est jamais réattribué ; les signalements que vous avez faits sont conservés sans votre identité.',
      'Toute autre demande (opposition, limitation, question) : écrivez à l’association — contact : ' + TODO,
    ],
  },
  {
    id: 'responsable',
    title: 'Responsable du service, hébergement et durées',
    items: [
      'Responsable du service : association EITT (Enseignement Informatique pour Toutes et Tous) — coordonnées : ' + TODO,
      'Base de données et fichiers hébergés chez Supabase — région d’hébergement : ' + TODO,
      'Site web hébergé chez : ' + TODO,
      'Durée de conservation : vos données sont conservées tant que votre compte existe. Il n’y a pas, à ce stade, de suppression automatique des comptes inactifs. Durée à confirmer : ' + TODO,
    ],
  },
  {
    id: 'mineurs',
    title: 'Mineurs',
    paragraphs: [
      'Politique d’âge minimum et conditions d’accès des mineurs : ' + TODO,
      'Quelle que soit la politique retenue, ne communiquez jamais d’informations personnelles (adresse, école, téléphone) à une personne que vous ne connaissez pas.',
    ],
  },
]

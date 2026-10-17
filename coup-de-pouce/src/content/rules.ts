import { RULES_UPDATED_LABEL, RULES_VERSION } from '../lib/config'

export interface Rule {
  n: number
  title: string
  icon: string
  intro?: string[]
  items?: string[]
  itemsTitle?: string
  outro?: string[]
}

export const RULES_INTRO =
  'Coup de Pouce est un espace d’entraide numérique ouvert à toutes et à tous. Pour que chacun puisse poser ses questions, apprendre et aider les autres dans un environnement respectueux, quelques règles doivent être respectées.'

export const RULES: Rule[] = [
  {
    n: 1, title: 'Respect de chacun', icon: 'heart',
    intro: ['Chaque utilisateur doit s’adresser aux autres avec respect. Un désaccord respectueux est toujours bienvenu.'],
    itemsTitle: 'Sont interdits :',
    items: ['Les insultes et le harcèlement.', 'Les menaces et l’intimidation.', 'Les propos discriminatoires.', 'Les humiliations répétées.', 'Les attaques personnelles.'],
  },
  {
    n: 2, title: 'Protection des données personnelles', icon: 'lock',
    intro: ['Ne publiez pas vos informations personnelles ou celles d’une autre personne sans autorisation.'],
    itemsTitle: 'Ne partagez jamais :',
    items: ['Des mots de passe.', 'Des codes de validation.', 'Des coordonnées bancaires.', 'Des documents d’identité.', 'Des adresses privées.', 'Des conversations privées sans autorisation.', 'Des données confidentielles appartenant à autrui.'],
    outro: ['Ne demandez jamais à un autre utilisateur son mot de passe ou ses codes de connexion.'],
  },
  {
    n: 3, title: 'Liens et fichiers', icon: 'link',
    intro: ['Les utilisateurs peuvent partager des liens, des images, des GIF et des vidéos légères dans les limites prévues par la plateforme. Cependant, il est interdit de partager :'],
    items: ['Des liens malveillants.', 'Des fichiers destinés à infecter un appareil.', 'Des contenus conçus pour voler des informations.', 'Des logiciels malveillants.', 'Des fichiers frauduleux.', 'Des liens de phishing.', 'Des contenus manifestement dangereux pour les autres utilisateurs.'],
    outro: ['N’ouvrez pas un lien simplement parce qu’il a été envoyé par un membre de la communauté.'],
  },
  {
    n: 4, title: 'Pas d’arnaques ni d’usurpation d’identité', icon: 'mask',
    itemsTitle: 'Il est interdit :',
    items: ['De se faire passer pour une autre personne.', 'De créer de faux profils dans le but de tromper les utilisateurs.', 'De proposer de fausses aides pour obtenir des données personnelles.', 'D’organiser des escroqueries.', 'De demander de l’argent de manière frauduleuse.'],
  },
  {
    n: 5, title: 'Utilisation correcte de l’entraide', icon: 'help',
    intro: ['Coup de Pouce sert à apprendre, à poser des questions et à aider les autres.'],
    itemsTitle: 'Les utilisateurs doivent :',
    items: ['Décrire leurs problèmes de manière claire.', 'Respecter les personnes qui leur viennent en aide.', 'Éviter le spam et les publications répétitives.', 'Ne pas détourner la plateforme de son objectif.'],
  },
  {
    n: 6, title: 'Respect des contenus partagés', icon: 'file',
    intro: ['Ne publiez pas de contenus portant atteinte aux droits d’autrui.', 'Il est interdit de partager des contenus intimes non consentis, des contenus sexuels impliquant des mineurs, des contenus de harcèlement ou d’autres contenus manifestement illicites.'],
  },
  {
    n: 7, title: 'Respect de la loi et sécurité', icon: 'shield',
    intro: ['Les utilisateurs doivent respecter la loi applicable et ne pas utiliser la plateforme pour faciliter des activités malveillantes.', 'Les demandes d’aide en cybersécurité doivent rester dans un cadre légal et autorisé.'],
  },
  {
    n: 8, title: 'Signalement et modération', icon: 'flag',
    intro: ['Tout utilisateur peut signaler un profil, une demande d’aide ou un message problématique grâce au bouton « Signaler ».'],
    itemsTitle: 'Pour chaque signalement, la plateforme enregistre :',
    items: ['L’identifiant de l’auteur du signalement.', 'Le contenu concerné (avec un extrait conservé même si le message est supprimé ensuite).', 'Le motif.', 'La date.', 'Le statut du signalement (ouvert, en cours d’examen, traité ou rejeté).'],
    outro: ['Les signalements sont stockés de façon confidentielle : seules les personnes désignées comme modératrices ou modérateurs peuvent les consulter. À ce stade, le traitement est manuel et il n’existe pas de modération automatique ; aucun délai de réponse n’est garanti. En cas de danger immédiat, contactez les services d’urgence (112).'],
  },
  {
    n: 9, title: 'Sanctions possibles', icon: 'scale',
    intro: ['En cas de non-respect des règles, des mesures proportionnées peuvent être appliquées selon les moyens de modération réellement disponibles :'],
    items: ['Avertissement.', 'Suppression d’un contenu.', 'Restriction temporaire.', 'Blocage d’un compte.', 'Suspension ou suppression du compte dans les cas appropriés.'],
    outro: ['Aucune sanction automatique n’est appliquée à ce stade : chaque décision est prise par une personne.'],
  },
  {
    n: 10, title: 'Évolution des règles', icon: 'refresh',
    intro: ['Les règles peuvent évoluer pour protéger la communauté et améliorer la plateforme. La date de dernière mise à jour est indiquée sur cette page et les changements importants sont présentés dans l’historique ci-dessous. Lorsque les règles changent, vous devez les accepter à nouveau pour continuer à écrire.'],
  },
]

export const SAFETY_TIPS = [
  'Ne communiquez jamais votre mot de passe.',
  'Ne partagez pas vos codes de connexion.',
  'Ne publiez pas votre adresse personnelle.',
  'N’envoyez pas de document d’identité dans une conversation.',
  'Vérifiez les liens avant de les ouvrir.',
  'N’exécutez pas un fichier provenant d’une personne inconnue.',
  'Ne communiquez pas d’informations bancaires.',
  'Signalez les comportements suspects.',
]

export const RULES_HISTORY = [
  { version: RULES_VERSION, date: RULES_UPDATED_LABEL, change: 'Première version des règles de la communauté.' },
]

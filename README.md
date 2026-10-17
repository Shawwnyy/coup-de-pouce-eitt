# Coup de Pouce by EITT

Plateforme d'entraide numérique de l'association **EITT** (« Enseignement Informatique pour Toutes et Tous », <https://eitt.webnode.fr>).
Interface en français. Comptes avec identifiant public permanent (`User#0001`), recherche exacte par identifiant, messagerie privée en temps réel avec médias, demandes d'aide, thèmes (EITT, sombre, clair, personnalisé), règles de la communauté, signalement et blocage.

**Pile technique** : React 19 + TypeScript + Vite · CSS simple (aucune bibliothèque de style) · Supabase (authentification, base PostgreSQL, temps réel, stockage). Aucun serveur à écrire ni à maintenir : toute la sécurité est dans la base (RLS + fonctions SQL).

---

## 00. VERSION SANS COMPTE — double-cliquez sur `Coup-de-Pouce.html`

**C'est le fichier à ouvrir.** Un seul fichier, aucune installation, aucun serveur, pas d'Internet nécessaire (sauf pour ouvrir les liens).

- **Pas d'inscription ni de connexion** : un clic sur « Commencer » crée un profil avec un identifiant **tiré au hasard** (par exemple `User#4827`, bouton « Autre numéro » pour en retirer un), gardé dans votre navigateur. À la réouverture, vous retrouvez votre profil.
- **Plusieurs profils** : créez-en d'autres (chacun a son numéro au hasard), changez de profil, **modifiez le nom**, **supprimez** un profil (ses messages, fichiers et demandes d'aide sont effacés ; son numéro n'est jamais réutilisé). Menu « Paramètres › Compte » : télécharger ses données, tout effacer.
- **Recherche** : par nom (un morceau suffit, sans tenir compte des accents ni des majuscules : `leo g` trouve `Léo.G`) ou par identifiant exact (`User#4827`). Seuls les profils créés sur cet appareil existent. Un profil sans nom n'est trouvable que par son numéro ; les réglages permettent de ne plus être trouvé. (La version Supabase, elle, garde volontairement la recherche limitée à l'identifiant exact pour protéger la vie privée.)
- **Images (PNG/JPEG/WebP ≤ 5 Mo), GIF (≤ 5 Mo), vidéos (MP4/WebM ≤ 20 Mo) et liens** fonctionnent : les fichiers sont vérifiés (signature réelle des octets, taille) puis gardés dans le navigateur (IndexedDB). Si le navigateur refuse d'enregistrer un fichier, l'envoi **échoue avec un message** : rien n'est jamais « simulé ». Les liens ne s'ouvrent jamais seuls (carte + bouton, `noopener noreferrer`) ; le texte n'est jamais interprété comme du HTML.
- **Demandes d'ajout** : dans la recherche, le bouton est « Demander en contact » ; on ne peut écrire à quelqu'un de cet appareil qu'**après son acceptation**. La personne voit une **pop-up verte** (« Demande d'ajout… » avec **Accepter**, **Refuser**, **Plus tard**) ; le demandeur voit ensuite une pop-up (verte si acceptée, grise si refusée). Après un refus, nouvelle demande possible au bout de 24 h ; si les deux se demandent mutuellement, c'est accepté d'office ; bloquer annule les demandes en attente. Page « Demandes d'ajout » (bas de page) : reçues et envoyées. Les personnes ajoutées par code d'un autre appareil sont déjà choisies : pas de demande. **Limites** : les demandes ne circulent qu'entre les profils de ce navigateur (pas vers d'autres appareils) ; pas de notification du navigateur (aucune permission demandée) ; les conversations créées avant cette mise à jour restent ouvertes.
- **Alerte rouge** : en publiant une demande d'aide, on peut cocher « Alerte rouge » (urgent). La demande s'affiche en rouge (liste, page de la demande, en tête de liste) et un **bandeau rouge** apparaît en haut de page pour les **autres profils de ce navigateur** tant qu'elle n'est pas « Résolue » (bouton « Masquer » pour la session). Une seule alerte rouge active par profil. **Limites** : l'alerte n'est vue que sur cet appareil (elle n'est pas envoyée aux autres appareils et ne fait pas partie du fichier de messages) ; elle n'envoie ni SMS, ni e-mail, ni notification du navigateur ; **ce n'est pas un service d'urgence** (112 en cas de danger). Elle n'existe que dans la version locale : la base Supabase n'a pas cette colonne.
- **Autre appareil, sans serveur** (page « Autre appareil (code) » en bas de chaque page) : un navigateur ne peut pas voir un autre appareil tout seul, donc personne n'est « trouvé » automatiquement. On échange (1) un **code de partage** (`CDP1.…`, contient seulement le numéro et le nom affiché ; il est affiché dans votre **profil**, avec un bouton « Copier mon code », et sur la page « Autre appareil ») : une fois ajouté, la personne se retrouve par nom ou numéro ; (2) un **fichier de messages** (texte, liens, images, vidéos) préparé dans l'appli et envoyé par vos propres moyens (messagerie, e-mail, clé USB) ; l'autre personne l'importe. Ce n'est ni instantané ni automatique ; le fichier n'est pas chiffré. Tout import est revérifié (formats, tailles, signature réelle des fichiers) ; un fichier destiné à un autre profil est refusé ; un ré-import ne crée pas de doublons. Pour un vrai « trouver tout le monde » avec messages instantanés fiables, il faut un service en ligne partagé que vous maîtrisez (par exemple la version Supabase de ce dossier) ; le mode En ligne ci-dessous en est une version légère, sans compte.
- **Modifier / supprimer un message, « est en train d'écrire… »** (version locale) : menu « … » d'un de **ses** messages › « Modifier » (édition en place, mention « (modifié) ») ou « Supprimer ». Entre profils du même navigateur, tout se voit tout de suite dans l'autre onglet. **En ligne**, la modification et la suppression partent sur le canal chiffré et s'appliquent chez l'autre (la dernière modification gagne ; un message encore « en attente d'envoi » est simplement remplacé). **Limites, sans détour** : en mode fichier (contact sans lien en ligne), modifier/supprimer ne part pas — l'autre garde ce qu'il a déjà reçu ; on ne peut modifier que le texte (pas la pièce jointe) ; supprimer chez l'autre suppose qu'il est ou sera en ligne (la suppression attend dans le relais quelques heures). L'indicateur « est en train d'écrire… » s'affiche 9 s ; en ligne c'est un petit message chiffré au plus toutes les 8 s qui compte dans la limite du relais gratuit ; réglage pour le couper dans Paramètres › Compte (« Montrer … à mes contacts »). Son contenu est chiffré comme les messages.
- **Pensée de la minute** : une pensée **change chaque minute** (même pensée au même moment sur tous les appareils), **à droite de l'écran sur ordinateur (≥ 1200 px)** et **en bande au-dessus de la barre du bas sur téléphone / fenêtre étroite**. Pensées originales écrites pour Coup de Pouce (aucune n'est attribuée à une personnalité, 65 pensées, une même ne revient qu'après toutes les autres). Masquable (×), réaffichable par « Afficher les pensées » en bas de page ; la pensée du jour reste sur l'accueil.
- **Discussion générale** (version locale ; page « Discussion » dans la barre du haut, tuile sur l'accueil et lien dans Messages ; c'est le « salon » dont parle la suite) : un salon de discussion pour **tous les profils** (tous ceux qui ont un User#). Le nom affiché est celui du profil (modifiable dans le profil ; un message garde le nom qu'il avait quand il a été écrit). **Heure à la seconde** en haut à droite de chaque message (« 20:06:31 », avec la date si ce n'est pas aujourd'hui ; pour un message reçu en ligne, c'est l'heure de réception par le relais). **Modifier / supprimer ses propres messages** : menu « … » d'un de ses messages (modification en place, mention « (modifié) » ; suppression après confirmation). **« Léo.G est en train d'écrire… »** (ou « User#1234 est en train d'écrire… » si le profil n'a pas de nom ; « A et B sont en train d'écrire… » à deux) s'affiche sous la liste, s'éteint tout seul au bout de quelques secondes, et se coupe avec le réglage Paramètres › Compte (« Montrer … à mes contacts »). **Par défaut, il reste sur cet appareil** : tous les profils du même navigateur y écrivent et se lisent tout de suite (autre onglet compris), rien ne part sur internet. **En option, on peut rejoindre le salon public en ligne** (bouton « Rejoindre le salon en ligne », avec une pop-up de consentement) : les messages passent alors par le relais ntfy, sur un sujet **public et non chiffré** (`cdp1-room-general`) — **n'importe qui qui connaît ce sujet peut le lire et y écrire, avec ou sans Coup de Pouce**. **Sans modération, sans équipe, sans sanction possible.** Ce qui est fait pour limiter les dégâts, sans prétendre le résoudre : **texte seulement** (300 caractères max, pas de pièce jointe, **aucun lien cliquable**, jamais interprété comme du HTML), **un message toutes les 2 s au plus**, messages **signés** (ECDSA P-256, clé créée dans le navigateur ; une signature fausse, un message modifié, un message de plus de 6 h d'écart ou illisible est ignoré), chaque ligne affiche une **empreinte** de 6 caractères (`#a1b2c3`) liée à la clé, et **une alerte rouge « autre clé que d'habitude pour ce numéro »** apparaît si quelqu'un écrit sous un numéro déjà vu avec une autre clé. **Les noms et numéros ne sont pas vérifiés** : n'importe qui peut écrire « Léo.G User#1234 » ; seule l'empreinte permet de reconnaître la même personne d'un message à l'autre (et seulement tant qu'on a déjà vu sa clé : première rencontre = confiance par défaut). **Masquer** une personne (menu « … » d'un message) la cache **seulement pour vous**, par numéro + empreinte (un faux avec une autre clé se masque séparément) ; liste « Personnes masquées » avec « Réafficher ». **Limites, sans détour** : (1) le relais gratuit ne garde les messages que quelques heures et limite le débit ; quelqu'un qui rejoint voit l'historique encore conservé par le relais (au plus 300 messages gardés ici) ; (2) pas de liste de personnes présentes, pas de salons privés (pour parler en privé : Messages) ; (3) le relais et tous les lecteurs voient votre numéro, votre nom affiché, votre empreinte et l'heure, et le relais voit votre adresse internet ; (4) un profil qui n'a pas rejoint le salon en ligne ne voit que les messages locaux ; quitter le salon en ligne efface son historique public de cet appareil ; (5) un message local (« cet appareil ») n'est jamais envoyé en ligne, même après avoir rejoint ; (6) aucune notification. **Modifier, supprimer et « écrit… » en ligne** : la modification, la suppression et le signal « écrit… » sont des messages **signés** par la même clé que le message d'origine ; chez les autres, une modification ou suppression qui ne vient pas de la clé de l'auteur (même numéro, autre clé) est **ignorée**, une ancienne version rejouée aussi. **Limites, sans détour** : une suppression ne peut pas effacer ce que les gens ont déjà lu ou copié, ni ce que le relais garde quelques heures ; elle ne s'applique chez quelqu'un qui est hors ligne qu'à sa prochaine connexion ; si le relais est injoignable, la modification ou la suppression échoue avec un message (rien n'est modifié ou supprimé en silence chez vous seulement) ; chaque modification, suppression et signal « écrit… » compte dans la limite du relais gratuit (le signal « écrit… » part au plus toutes les 8 s en ligne, toutes les 3 s entre onglets de cet appareil) ; le nom montré dans « écrit… » n'est pas vérifié, comme celui des messages, et un « écrit… » est ignoré si le numéro est déjà connu avec une autre clé. **Vérifié ici** (e2e10 : 34 contrôles ; e2e11 : 43 contrôles sur modifier/supprimer/heure à la seconde/« écrit… », en local à trois profils puis en ligne avec trois appareils simulés — dont modifications, suppressions et « écrit… » falsifiés, et rattrapage tardif ; avec un **faux relais** local) : messages vus dans l'autre onglet sans recharger, limite de débit, texte brut (le HTML collé s'affiche tel quel), refus au-delà de 300 caractères, masquer/réafficher, rejoindre/quitter, pas de doublon chez l'auteur, rattrapage de l'historique, messages signés sans clé privée sur le relais, usurpation d'un numéro signalée en rouge, signature fausse / message rejoué / JSON invalide / trop long ignorés. **Non vérifié** : le salon avec le **vrai** ntfy.sh (non testé depuis l'environnement de développement), le comportement avec beaucoup de monde, et toute notion de sécurité contre un attaquant déterminé.
- **Mode En ligne / Hors ligne (bêta)** : interrupteur dans la barre sous l'en-tête et dans Paramètres › Compte. **La case « Recevoir les demandes des autres appareils » est cochée par défaut à la création du profil** (avec explication ; décochable) : le profil « écoute » alors sa boîte de demandes, sans rien publier tant qu'on n'agit pas (le relais voit l'adresse internet). Les profils créés avant ce mode reçoivent **une seule** pop-up « Recevoir les demandes ? » (Annuler = reste hors ligne). Hors ligne, **rien n'est envoyé sur internet**. **Code court** : le User# (ex. User#4827) est le code à donner ; on le tape dans la recherche (« 4827 » suffit) et une **pop-up** propose d'envoyer la demande (prénom facultatif noté localement, rappel de ce qui part sur internet, passage en ligne au même clic), puis une **pop-up verte « Demande envoyée »** s'affiche ; chez l'autre, la pop-up verte « Accepter / Refuser » apparaît dès qu'il ouvre Coup de Pouce en ligne (la demande l'attend quelques heures dans le relais ; si la page est fermée, rien ne peut l'atteindre). L'ancien code long CDP1… reste, replié, pour l'échange sans internet. En ligne, on **ajoute quelqu'un d'un autre appareil en tapant son User#** dans la recherche (bouton « Envoyer la demande à User#… ») : la demande arrive chez lui en quelques secondes (même pop-up verte : Accepter / Refuser / Plus tard), puis on s'écrit en **texte, chiffré de bout en bout** (ECDH P-256 + AES-GCM, clés créées dans le navigateur ; code de vérification à 8 chiffres identique des deux côtés, à comparer par un autre moyen). Un code de partage CDP1… collé dans la recherche ajoute aussi la personne, mais **un contact ajouté par code ne reçoit rien tout seul** : la conversation affiche « Pas envoyé : reste sur cet appareil » et un bouton « Passer en ligne et envoyer la demande à User#… » ; dès que l'autre accepte, les textes déjà écrits partent automatiquement (une demande en attente peut être renvoyée). **Les deux personnes doivent passer en ligne** (la page Messages vide l'explique en 3 étapes). Comment ça marche : un **relais public gratuit de type ntfy** (par défaut `https://ntfy.sh`, modifiable dans Paramètres › Compte › Relais) sert de point de rencontre ; les messages en attente sont repris à la reconnexion (le relais ne les garde que quelques heures) ; si le relais est injoignable, les messages restent « en attente d'envoi » et partent au retour. **Limites et risques, sans détour** : (1) la boîte de demandes d'un numéro est **publique** (elle se calcule à partir du numéro) : n'importe qui peut y écrire (spam possible, pas de modération) et la lire (numéro, nom affiché, clé publique) ; (2) sans comparer le code de vérification, un attaquant actif qui écrirait dans cette boîte pourrait se faire passer pour la personne au moment de l'acceptation ; (3) le relais voit qu'un échange a lieu (heure, taille, nom de sujet illisible), il ne lit pas les textes ; (4) **texte seulement** (≈ 1 500 caractères max par message) : images et vidéos passent par le fichier d'échange ; (5) le relais gratuit limite le nombre de messages par jour et peut tomber ; (6) les numéros ne sont pas uniques entre appareils (deux personnes peuvent avoir le même User#4827 : la demande arrive aux deux, la première acceptation gagne) ; (7) on ne peut pas savoir à l'avance si un numéro existe ni si la personne est connectée, et la recherche par **nom** ne marche qu'entre profils déjà connus de cet appareil. **Vérifié ici** : 39 + 20 + 22 + 49 contrôles automatisés (dont modifier/supprimer/« écrit… » en local et en ligne, et les citations de la minute avec horloge simulée à 4 largeurs d'écran) (dont « contact ajouté par code puis message », la bannière de 320 à 2560 px, et « la personne qui n'a rien fait » : pop-up de demande, pop-up verte, pop-up unique d'activation) avec **deux/trois appareils simulés et un faux relais** local (demande reçue en moins de 6 s, accepter/refuser, texte chiffré dans les deux sens, aucun texte ni clé privée en clair sur le relais, rattrapage hors ligne sans doublon, relais coupé puis rétabli, pièces jointes jamais « envoyées » en ligne, données forgées ignorées). **Non vérifié** : le fonctionnement avec le **vrai** service ntfy.sh (non testé depuis l'environnement de développement) : à essayer à deux avec deux appareils avant de s'y fier.
- **Limites honnêtes** : ce n'est **pas** un vrai réseau. Les données restent sur cet appareil et dans ce navigateur (vider les données du site les efface ; un autre navigateur ou un autre ordinateur ne voit rien). Sans échange manuel, les conversations ont lieu **entre les profils créés dans le même navigateur** (ouvrez deux onglets, un par profil, pour voir les messages arriver). Il n'y a **pas de modération** : un signalement est seulement noté sur l'appareil. Pas de notification sur un autre appareil. Navigation privée : le navigateur peut tout oublier à la fermeture (l'application l'indique).
- Pour le vrai service multi-utilisateurs (comptes, messagerie entre appareils), utilisez la version Supabase des §1 à §6 (jamais testée contre un vrai projet Supabase, voir §1).
- **Vérifié ici** : ouverture par double-clic (`file://`) dans Chromium, 28 contrôles automatisés (création, renommage et suppression de profils, persistance après rechargement et dans un nouvel onglet, message avec lien, image, vidéo WebM, refus d'un faux PNG et d'un GIF trop gros, messages vus depuis l'autre profil, médias toujours là après rechargement, demande d'aide avec image, numéro jamais réutilisé, aucun débordement à 390 px, aucune erreur console). **Non testé** : Firefox, Safari, Edge ; lecture d'une vidéo MP4 (le Chromium de test n'a pas le codec H.264, la lecture MP4 dépend de votre navigateur) ; très gros volumes (le navigateur limite l'espace de stockage, l'envoi échoue alors avec un message).\n- Reconstruire ce fichier à partir des sources : `npm run build:local` (utilise esbuild).

---

## 0. Démarrage rapide de la version Supabase (Windows) — ne double-cliquez PAS sur `index.html`

Le fichier `index.html` du dossier est un fichier **source** : l'ouvrir directement dans le navigateur affiche une **page blanche** (c'est normal, il faut un petit serveur de développement).

1. Installez **Node.js** version « LTS » (≥ 22) : <https://nodejs.org>.
2. Décompressez le zip, puis **double-cliquez sur `LANCER.bat`**. Il installe les composants la première fois, crée `.env.local` et ouvre le site dans votre navigateur.
3. Sans Supabase, le site s'ouvre mais les comptes/messagerie affichent « Configuration requise » (rien n'est simulé). Pour tout activer, suivez le §3 : créez un projet Supabase gratuit, collez **`supabase/setup_all.sql`** dans son éditeur SQL, puis copiez l'URL et la clé « anon » dans `.env.local`.

Sur Mac/Linux : `npm install` puis `npm run dev`.

---

## 1. État réel du projet (lisez ceci d'abord)

### Vérifié ici, de façon automatisée
| Quoi | Comment | Résultat |
|---|---|---|
| Schéma, RLS, fonctions SQL, règles de stockage (le fichier livré `setup_all.sql`, 4 migrations) | `supabase/tests/rls_test.sql` sur un vrai PostgreSQL 16 jetable (avec un décor minimal imitant Supabase) | ✔ tout passe |
| Logique pure (liens, types de fichiers, citation du jour, contraste, notifications, erreurs, refus des clés secrètes) | `npm test` (36 tests) | ✔ 36/36 |
| L'application compile et s'affiche (bureau + mobile, 4 thèmes) ; parcours inscription, mot de passe oublié, recherche, envoi, échec + nouvel essai, fichiers refusés, aperçu, lightbox, signalement, blocage, thèmes, notifications par défaut, écran de modération, export des données | Application assemblée avec esbuild + Chromium (Playwright) contre une **fausse API en mémoire** | ✔ 49 contrôles sur 49, 0 erreur console |
| Types TypeScript | `tsc --strict` avec des déclarations minimales de React/Supabase | ✔ aucune erreur (hors callbacks du SDK Supabase, voir ci-dessous) |

### Jamais vérifié ici — à faire avant de mettre en ligne
Ces vérifications n'ont **pas** pu être faites dans l'environnement de développement (pas d'accès au registre npm, pas de projet Supabase). Ne considérez donc pas ces points comme garantis :

- **Aucun test contre un vrai projet Supabase** : connexion e-mail/mot de passe, e-mail de confirmation, temps réel (`postgres_changes`), envoi réel vers Storage, URL signées, jointures PostgREST (`author:profiles!author_id(...)`). Les migrations SQL, elles, sont testées (tableau ci-dessus), mais pas la façon dont le navigateur les appelle via l'API Supabase.
- **`npm install` et `npm run build` (Vite) n'ont pas été exécutés** : la compilation a été vérifiée avec esbuild, pas avec Vite. Lancez `npm run build` une première fois ; s'il signale une erreur de type liée au SDK Supabase (callbacks `onAuthStateChange`, `.on('postgres_changes', …)`), elle sera à corriger dans `src/lib/api.ts`.
- Rendu uniquement vérifié sur Chromium (pas Firefox/Safari, pas de vrai téléphone).
- Pas de test de charge, pas d'audit de sécurité externe.

### Terminé et fonctionnel (dans les limites ci-dessus)
Comptes et identifiant `User#0001…` attribué par la base (jamais côté navigateur, immuable) · recherche exacte limitée à 30/min, sans fuite d'e-mail, message exact « Aucun utilisateur trouvé. Vérifiez l'identifiant et réessayez. » · messagerie privée (historique, ordre chronologique, date/heure, temps réel, état vide, copier, signaler, bloquer, quitter, erreur + « Réessayer ») · images PNG/JPEG/WebP, GIF animés (5 Mo), vidéos MP4/WebM (20 Mo), aperçu et annulation avant envoi, lightbox, lecteur vidéo sans lecture automatique, URL signées temporaires · liens cliquables avec domaine affiché, ouverts avec `noopener noreferrer`, jamais chargés automatiquement · demandes d'aide (10 catégories, statuts, image facultative, contacter l'auteur, signaler, suppression par l'auteur) · accueil (logo animé EITT, recherche, accès rapides, règles bien visibles, citation du jour) · thèmes Clair / Sombre / EITT (défaut) / Personnalisé avec garde-fous de contraste et aperçu · notifications : tout est désactivé par défaut sauf un indicateur discret, permission du navigateur demandée uniquement après un clic · règles (10 règles, date, historique, case à cocher à l'inscription, nouvelle acceptation si la version change) · signalements enregistrés (réservés aux modérateurs) · liste de blocage gérable · **mot de passe oublié** (demande + choix du nouveau mot de passe, message identique que l'adresse existe ou non) · **écran de modération** `/moderation` (visible seulement des comptes désignés modérateurs ; liste, filtre par statut, prise en charge / traité / rejeté ; les liens d'un extrait signalé ne sont jamais cliquables) · **export de vos données** (JSON fabriqué dans le navigateur) · **page Confidentialité** décrivant ce que l'application fait réellement des données · **garde-fou** : le site refuse de démarrer si la clé collée dans `.env.local` est une clé secrète `service_role`.

### Pas développé (honnêtement)
- **Aucune équipe de modération n'existe.** L'écran `/moderation` est prêt, mais il faut que l'association désigne des personnes (en SQL, voir §3) et les forme. Il n'y a **aucune sanction automatique** (pas de blocage ou suspension de compte depuis l'écran : seules les décisions sur les signalements sont enregistrées) ni de notification aux modérateurs quand un signalement arrive. Les pages du site le disent clairement.
- **La page Confidentialité est un texte technique à finaliser** : responsable, hébergeur, durées de conservation, contact et politique pour les mineurs sont marqués « À compléter » (surlignés) tant que `LEGAL_COMPLETED` vaut `false` dans `src/lib/config.ts`. Ce n'est pas un avis juridique.
- Pas de notifications par e-mail (l'option est affichée comme indisponible), pas de vraies notifications « push » onglet fermé : les notifications du navigateur n'apparaissent que tant que l'onglet est ouvert.
- Pas de pièces jointes de type document (PDF, etc.), pas de lecteur vidéo intégré pour les liens externes, pas de favoris.
- **Pas d'analyse antivirus côté serveur.** Le serveur impose la taille et le type déclarés (relus dans Storage, pas dans la requête) ; la vérification du contenu réel (signature binaire, SVG/HTML refusés) est faite dans le navigateur, donc contournable par un client malveillant. Les fichiers restent privés et ne sont servis qu'en URL signée.
- Les fichiers de Storage ne sont pas purgés si l'on supprime un compte directement en SQL (le bouton « Supprimer mon compte » de l'application, lui, les supprime d'abord).
- Détection de liens : seulement des signes à vérifier (http non chiffré, adresse IP, raccourcisseur, domaine trompeur probable…). **Elle ne détecte pas toutes les arnaques** et ne prétend pas le faire.
- `allow_contact` (« accepter les nouvelles conversations ») ne s'applique qu'aux nouvelles conversations.
- Mentions légales et conditions générales d'utilisation : **à rédiger par l'association** avant ouverture au public.
- L'export de données contient vos informations et les messages que **vous** avez écrits (pas ceux reçus, ni les fichiers eux-mêmes).
- Le lien de réinitialisation du mot de passe doit être ouvert dans le **même navigateur** que celui de la demande (protection PKCE), sinon la page indique « lien invalide ».

---

## 2. Installation en local (ligne de commande)

Prérequis : Node.js ≥ 22.12 et un projet Supabase (gratuit : <https://supabase.com>). Sous Windows, `LANCER.bat` fait ces étapes pour vous (§0).

```bash
npm install
cp .env.example .env.local     # puis renseignez vos valeurs (voir §3)
npm run dev                    # http://localhost:5173
npm test                       # tests unitaires (Node, sans dépendance)
npm run build                  # contrôle de types + build dans dist/
```

> Après le premier `npm install`, versionnez le fichier `package-lock.json` (le workflow GitHub Actions s'en servira avec `npm ci`).

Sans variables Supabase, l'application s'ouvre quand même : les pages publiques (accueil, règles, apparence) fonctionnent et les autres affichent une page « Configuration requise » ; aucun envoi n'est simulé.

## 3. Configuration de Supabase

1. **Créez un projet** sur supabase.com.
2. **Installez la base** — le plus simple : ouvrez `supabase/setup_all.sql`, copiez tout, collez-le dans Supabase > SQL Editor > New query > Run (sur un projet neuf, **une seule fois**). Ce fichier contient les 4 migrations ci-dessous dans l'ordre (régénérable avec `npm run sql:bundle`). Vous pouvez aussi les exécuter une par une ou avec `supabase db push` :
   1. `supabase/migrations/20261017000001_schema.sql` — tables, identifiant public, déclencheurs, limitation de débit
   2. `supabase/migrations/20261017000002_security.sql` — fonctions (recherche, messages, signalements…), droits, RLS
   3. `supabase/migrations/20261017000003_storage.sql` — buckets `avatars` (public, 1 Mo), `help-images` (privé, 5 Mo), `chat-media` (privé, 20 Mo) et leurs règles
   4. `supabase/migrations/20261017000004_moderation.sql` — fonction `am_i_moderator()` pour l'écran de modération
3. **Authentification** (Authentication > Providers > Email) : activez « Email », mot de passe de **8 caractères minimum**. Gardez « Confirm email » activé (recommandé).
4. **URLs** (Authentication > URL Configuration) : *Site URL* = l'adresse de votre site ; ajoutez-la aussi dans *Redirect URLs*, avec un joker pour que le lien « mot de passe oublié » fonctionne : `https://votre-site/**` et `http://localhost:5173/**` pour le développement.
5. **Clés** (Project Settings > API) : copiez l'URL du projet et la clé **anon** (publique) dans `.env.local`. **N'utilisez jamais la clé `service_role` dans ce projet** : elle contourne toute la sécurité.
6. **Temps réel** : la migration 1 ajoute `messages` et `help_requests` à la publication `supabase_realtime`. Vérifiez dans Database > Replication.
7. **Désigner un modérateur** (dans l'éditeur SQL, après que la personne a créé son compte) :
   ```sql
   insert into private.moderators (user_id) values ('<uuid du compte dans Authentication > Users>');
   ```
   La personne voit alors l'icône « bouclier » dans l'en-tête et l'écran `/moderation` (rechargez la page). Les autres utilisateurs n'y ont aucun accès : même en appelant l'API à la main, la base ne leur renvoie rien. Pour retirer un modérateur : `delete from private.moderators where user_id = '<uuid>';`.
8. **Changer la version des règles** : modifiez `private.current_rules_version()` (SQL) **et** `RULES_VERSION` dans `src/lib/config.ts`, ajoutez une ligne à l'historique dans `src/content/rules.ts`. Chaque membre devra réaccepter les règles pour écrire.

## 4. Déploiement

L'application est statique (dossier `dist/`) : l'hébergeur ne sert que des fichiers, Supabase s'occupe du temps réel. **GitHub Pages seul ne suffirait pas** pour une vraie messagerie (il n'a ni base ni temps réel) ; ici il ne sert que de vitrine statique, la base reste Supabase.

| Hébergeur | Réglages |
|---|---|
| **Vercel** / **Netlify** / **Cloudflare Pages** (recommandé) | Commande de build `npm run build`, dossier `dist`. Variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`, `VITE_BASE=/`. Les en-têtes de sécurité sont dans `vercel.json` (Vercel) ou `public/_headers` (Netlify/Cloudflare — remplacez `VOTRE-PROJET`). La redirection monopage est dans `vercel.json` / `public/_redirects`. |
| **GitHub Pages** | Settings > Pages > Source « GitHub Actions ». Dans Settings > Secrets and variables > Actions > *Variables* : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Le workflow `.github/workflows/deploy-pages.yml` construit avec `VITE_BASE=/nom-du-depot/` et crée `404.html` (repli pour les routes). |

Une politique `Content-Security-Policy` (balise `<meta>`) est injectée au build : elle n'autorise que le site lui-même et votre projet Supabase.

**Aucun secret n'est dans le dépôt** : seuls l'URL Supabase et la clé *anon* (publique par conception) sont utilisées, via les variables d'environnement. `.env*` est ignoré par Git (sauf `.env.example`).

## 5. Liste de tests manuels (à faire sur votre projet Supabase)

Créez deux comptes A et B (deux navigateurs ou une fenêtre privée) puis vérifiez :

1. ☐ A et B reçoivent chacun un identifiant unique (`User#0001`, `User#0002`) ; il ne change jamais.
2. ☐ A cherche `User#0002` → profil de B affiché, sans e-mail ; `User#9999` → « Aucun utilisateur trouvé. Vérifiez l'identifiant et réessayez. »
3. ☐ A ouvre une conversation privée avec B ; B la voit.
4. ☐ Les messages apparaissent chez B sans recharger la page, et restent après rechargement.
5. ☐ Un compte C (tiers) ne voit pas la conversation (aucun accès direct possible : testez avec l'URL `/messages/<id>`).
6. ☐ A envoie une image PNG/JPEG/WebP : aperçu, annulation possible, envoi, affichage et lightbox chez B.
7. ☐ Un fichier > 5 Mo (image) ou > 20 Mo (vidéo) est refusé avec un message clair.
8. ☐ Un `.exe`, un `.svg`, un faux `.png` sont refusés.
9. ☐ Un lien collé est cliquable, affiche son domaine et ne charge rien automatiquement.
10. ☐ Le thème choisi (y compris personnalisé) reste après rechargement et après reconnexion.
11. ☐ La page `/regles` est accessible sans compte, le lien est visible sur l'accueil.
12. ☐ Un signalement apparaît dans `public.reports` (visible uniquement d'un modérateur).
13. ☐ Après blocage, B ne peut plus écrire à A et n'apparaît plus dans sa recherche.
14. ☐ Dans Paramètres > Notifications : e-mail, son, alertes visuelles et notifications du navigateur sont désactivés par défaut ; la permission du navigateur n'est demandée qu'au clic.
15. ☐ Les choix de types d'événements sont respectés.
16. ☐ L'interface est utilisable sur téléphone et sur ordinateur, au clavier seul (Tab, Entrée, Échap) et avec un lecteur d'écran.
17. ☐ « Mot de passe oublié ? » : le message arrive, le lien (ouvert dans le même navigateur) permet de choisir un nouveau mot de passe, et le même message s'affiche pour une adresse inconnue.
18. ☐ Après `insert into private.moderators…`, le compte voit `/moderation` et peut traiter un signalement ; un autre compte voit « Accès réservé ».
19. ☐ Paramètres > Compte > « Télécharger mes données » télécharge un fichier JSON correct.
20. ☐ Avec la clé `service_role` collée par erreur dans `.env.local`, le site refuse de démarrer et l'explique.

## 6. Architecture et sécurité en bref

- **Identifiant public** : séquence PostgreSQL + colonne générée `public_id` ; un déclencheur interdit toute modification. L'identifiant interne (UUID) est distinct et jamais affiché.
- **RLS partout** : les tables n'acceptent pas d'écriture directe pour messages, conversations et signalements ; tout passe par des fonctions `SECURITY DEFINER` (`send_message`, `start_conversation`, `report_content`, `search_profiles`…) qui revérifient l'appartenance, les blocages (dans les deux sens), l'acceptation des règles, la taille et le type **réels** du fichier (lus dans `storage.objects`) et appliquent la limitation de débit. Le schéma `private` (non exposé par l'API) contient les aides RLS, la limitation de débit et la liste des modérateurs.
- **Avatars** : le bucket `avatars` est public en lecture (une photo de profil est visible de tous, c'est le principe d'un profil public) ; les autres buckets sont privés.
- **Stockage** : `chat-media` et `help-images` sont privés (URL signées d'1 h) ; écriture seulement dans un dossier de conversation dont on est membre, sans blocage, avec quota. Aucun SVG/HTML accepté nulle part.
- **Erreurs génériques** pour ne rien révéler (ex. contact impossible = même message que blocage ou refus).
- **Aucune clé secrète dans le code** ; la clé *anon* ne peut rien sans les règles RLS.

Arborescence : `src/` (pages, composants, contextes, `lib/` pour la logique et l'accès aux données), `src/content/rules.ts` et `src/content/privacy.ts` (textes des règles et de la confidentialité), `LANCER.bat` (démarrage Windows), `supabase/migrations/` (SQL), `supabase/tests/` (tests SQL), `public/` (logo, en-têtes), `.github/workflows/` (déploiement optionnel).

### Lancer les tests SQL vous-même

Il faut PostgreSQL 14+ installé (`initdb`, `pg_ctl`, `psql`) ; rien ne touche votre projet Supabase :

```bash
npm run test:sql
```

## 7. Licence et crédits

Logo animé « EITT » fourni par l'association. Les 40 pensées du jour sont des textes originaux écrits pour le projet (aucune citation attribuée à une personne réelle).

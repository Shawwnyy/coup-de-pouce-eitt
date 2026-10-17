/**
 * Pensées du jour : toutes ORIGINALES, rédigées pour Coup de Pouce, sans attribution.
 * On n'affiche jamais une phrase sous le nom d'une personnalité.
 */
export const QUOTES: readonly string[] = [
  'Une question posée est déjà un premier pas vers la solution.',
  'On apprend plus facilement quand on peut demander de l’aide.',
  'Chaque difficulté peut devenir une occasion de comprendre quelque chose de nouveau.',
  'Avancer ensemble ne signifie pas avancer au même rythme.',
  'Il n’est pas nécessaire de tout savoir pour pouvoir aider.',
  'Un message clair vaut mieux qu’un long silence devant un écran.',
  'Personne ne naît à l’aise avec l’informatique : tout le monde a déjà cliqué au mauvais endroit.',
  'Expliquer simplement, c’est déjà bien comprendre.',
  'Une petite explication aujourd’hui peut éviter une grande frustration demain.',
  'Demander de l’aide n’est pas un aveu de faiblesse, c’est une façon d’avancer.',
  'Les bonnes habitudes numériques se transmettent comme un coup de main entre voisins.',
  'Prendre le temps de comprendre, c’est gagner du temps pour la suite.',
  'Aucune question n’est trop simple quand la réponse peut débloquer quelqu’un.',
  'Un mot de passe se protège, une bonne idée se partage.',
  'Aider quelqu’un à se débrouiller seul, c’est le plus beau des coups de pouce.',
  'La patience est la meilleure extension de n’importe quel logiciel.',
  'Un problème décrit avec précision est déjà à moitié résolu.',
  'Chaque fausse manipulation raconte ce qu’il reste à découvrir.',
  'Le numérique est plus accueillant quand on s’y retrouve à plusieurs.',
  'Il vaut mieux vérifier un lien deux fois que regretter un clic une fois.',
  'Apprendre à son rythme, c’est apprendre pour de bon.',
  'Un sourire dans un message, ça se lit aussi.',
  'Ce qui paraît évident pour l’un est une découverte pour l’autre : partageons-le.',
  'Une sauvegarde faite aujourd’hui, c’est une inquiétude de moins demain.',
  'Savoir dire « je ne sais pas encore », c’est le début d’un apprentissage.',
  'Chacun a quelque chose à transmettre, même sans le savoir.',
  'Une difficulté partagée pèse déjà moins lourd.',
  'Un clic de travers n’a jamais empêché personne de progresser.',
  'Poser une question aujourd’hui, c’est aider ceux qui se la posent en silence.',
  'La curiosité ouvre plus de portes qu’un mot de passe.',
  'Bien aider, c’est expliquer sans jamais faire sentir qu’on sait mieux.',
  'Un petit pas à la fois mène aussi loin qu’un grand bond.',
  'Les meilleures solutions commencent souvent par : « Montre-moi ce que tu vois. »',
  'Chaque jour est une bonne occasion d’apprendre un raccourci.',
  'Protéger sa vie privée est aussi une compétence numérique.',
  'Mieux vaut un « je n’ai pas compris » franc qu’un « oui » poli.',
  'Un bon coup de pouce ne fait pas à la place : il montre le chemin.',
  'L’entraide commence souvent par une phrase simple : « Je peux essayer de t’aider. »',
  'La technologie évolue vite, la bienveillance n’a pas besoin de mise à jour.',
  'Un jour on demande, un jour on répond : le cercle s’agrandit.',
  'Un écran qui bloque n’est pas une fin, c’est une énigme à résoudre à deux.',
  'Respirer, relire le message d’erreur, puis demander : trois gestes qui évitent bien des soucis.',
  'Celui qui explique apprend deux fois.',
  'Un fichier bien nommé est un cadeau fait à soi-même dans six mois.',
  'On ne se moque pas de la question de l’autre : on s’en souvient, c’était la nôtre hier.',
  'Une mise à jour, c’est comme un coup de balai : on la repousse, puis on est content de l’avoir faite.',
  'Un bon mot de passe est long, unique et jamais confié, même à quelqu’un de gentil.',
  'Un message poli ouvre plus de solutions qu’un message pressé.',
  'On avance mieux avec quelqu’un qui dit « montre-moi » qu’avec quelqu’un qui dit « c’est facile ».',
  'Ce qu’on a compris soi-même, on peut toujours le transmettre.',
  'Une capture d’écran vaut mille descriptions approximatives.',
  'Se tromper de bouton est la plus ancienne méthode d’apprentissage numérique.',
  'Le meilleur moment pour sauvegarder ses photos, c’est avant d’en avoir besoin.',
  'Un message de confiance se vérifie : l’expéditeur est-il bien celui qu’il prétend être ?',
  'Dire merci après une aide, c’est donner envie d’aider encore.',
  'Rien n’oblige à tout comprendre en une fois : une chose aujourd’hui, une autre demain.',
  'Les petites victoires numériques comptent : un fichier retrouvé, une imprimante qui répond.',
  'On est toujours le débutant de quelqu’un et l’expert de quelqu’un d’autre.',
  'Quand un lien paraît trop beau pour être vrai, il est rarement vrai.',
  'Un écran propre, une corbeille vidée, un esprit tranquille.',
  'Apprendre à demander précisément, c’est apprendre à résoudre à moitié.',
  'Un bon voisin numérique, c’est quelqu’un qui répond sans soupirer.',
  'Prendre cinq minutes pour apprendre un raccourci, c’est gagner des heures sur l’année.',
  'Une question posée tôt coûte moins cher qu’un problème découvert tard.',
  'Le calme est la première touche de dépannage.',
]

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/** Nombre de jours (calendrier LOCAL de l'utilisateur) depuis le 1er janvier 1970. */
export function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

/** Pas premier avec le nombre de citations : toutes sont vues avant qu'une se répète, dans un ordre peu prévisible. */
function strideFor(count: number): number {
  for (const s of [7, 11, 13, 17, 19, 23, 29, 31]) if (gcd(s, count) === 1) return s
  return 1
}

/** Index de la citation d'un jour donné : identique toute la journée, différent le lendemain. */
export function quoteIndexFor(d: Date, count: number = QUOTES.length): number {
  return (((dayNumber(d) * strideFor(count)) % count) + count) % count
}

export function quoteOfTheDay(d: Date = new Date()): string {
  return QUOTES[quoteIndexFor(d)]
}

/** Numéro de la minute (horloge de l'appareil) depuis 1970 : change toutes les 60 s, identique sur tous les appareils à cet instant. */
export function minuteNumber(d: Date = new Date()): number {
  return Math.floor(d.getTime() / 60_000)
}

/** Index de la citation d'une minute donnée : toutes passent avant qu'une se répète, dans un ordre peu prévisible. */
export function quoteIndexForMinute(minute: number, count: number = QUOTES.length): number {
  return (((minute * strideFor(count)) % count) + count) % count
}

export function quoteOfTheMinute(d: Date = new Date()): string {
  return QUOTES[quoteIndexForMinute(minuteNumber(d))]
}

// Le formulaire d'un credential se DÉRIVE du registre — jamais d'un cas par connecteur.
//
// Deux règles vivent ici, et ce sont des règles du CONTRAT BACKEND, pas de la
// présentation : quels champs servent réellement, et ce qu'on a le droit de ne pas
// renvoyer. Les mettre dans une vue les aurait dupliquées à chaque surface (perso,
// équipe, org) et fait diverger du serveur.
//
// ⚠️ **MIROIR d'un comportement serveur, comme `keyStack.ts` l'est de la cascade.**
// `relevantFields` reproduit `Connector.fields_for` (oto-backend) et `payloadFor`
// s'appuie sur la règle de merge de `credentials_store.merge_with_existing`. Aucun
// test ne relie les deux repos : une erreur ici ne casse rien à l'écran, **elle fait
// écrire au coffre autre chose que ce que l'utilisateur voit**. Toute évolution de la
// sélection par mode ou de la sémantique du champ vide se fait des DEUX côtés.
import type { CredentialField } from '@/types/api'

/** Les champs qu'un mode rend PERTINENTS.
 *
 * Un champ sans `when` vaut toujours. Un champ avec `when` n'apparaît que pour les
 * valeurs qu'il liste — `header_name` n'a rien à faire dans un formulaire `bearer`.
 *
 * ⚠️ Discriminant absent, non déclaré, ou pas encore choisi ⇒ **tout est pertinent**.
 * C'est volontaire, et c'est la règle du serveur : à ce stade la saisie n'a pas
 * tranché, et masquer serait deviner. */
export function relevantFields(
  fields: CredentialField[],
  discriminator: string | undefined,
  values: Record<string, string>,
): CredentialField[] {
  if (!discriminator) return fields
  const picked = (values[discriminator] ?? '').trim().toLowerCase()
  if (!picked) return fields
  return fields.filter((f) => !f.when?.length || f.when.includes(picked))
}

/** Ce qu'on ENVOIE au serveur, à partir de ce que l'utilisateur a tapé.
 *
 * Le serveur complète les clés ABSENTES par ce qu'il a au coffre, et traite une clé
 * PRÉSENTE ET VIDE comme un effacement explicite. D'où la seule asymétrie de ce
 * fichier : **un secret CONSERVÉ laissé vide est OMIS** — on ne peut pas le relire
 * pour le pré-remplir, donc « vide » y veut dire « je n'y touche pas », jamais
 * « efface-le ».
 *
 * Les champs non secrets, eux, partent toujours : ils sont pré-remplis, l'utilisateur
 * les VOIT, et en vider un est un geste délibéré qu'il faut respecter.
 *
 * ⚠️ `kept` vient de `keptSecrets` — **la même valeur que celle qui décide du
 * requis** (`requiredAtInput`). Les deux règles partagent volontairement cette
 * notion : un champ omis ici ne doit jamais être exigé là-bas, et l'inverse. Elles
 * ont divergé une fois, avec pour résultat un formulaire qu'on ne pouvait pas
 * soumettre (28/08) ; l'invariant est gravé dans le test de ce fichier.
 *
 * ⚠️ Renvoyer un secret vide sur un credential existant l'EFFACERAIT. C'est le piège
 * de ce lot (oto-dashboard#126) : le formulaire renvoyait tous ses champs, ce qui
 * était juste tant que le serveur remplaçait tout, et devient destructeur depuis
 * qu'il complète. */
export function payloadFor(
  fields: CredentialField[],
  values: Record<string, string>,
  opts: { kept: Set<string> },
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of fields) {
    const v = values[f.name] ?? ''
    if (v === '' && opts.kept.has(f.name)) continue
    out[f.name] = v
  }
  return out
}

/** Les secrets qu'on a le droit de laisser VIDES : ceux qui sont déjà au coffre.
 *
 * Un secret ne se relit pas, donc on ne peut pas demander lesquels sont posés. Mais on
 * connaît le mode STOCKÉ — il n'est pas secret, donc il revient avec le
 * pré-remplissage : un secret que ce mode-là rendait requis est forcément au coffre,
 * le serveur n'aurait pas accepté l'écriture sinon. Ceux-là, et eux seuls, cessent
 * d'être requis à la saisie.
 *
 * ⚠️ **Changer de mode rend un secret réellement MANQUANT** : un credential `bearer`
 * n'a pas de mot de passe au coffre. Passer en `basic` doit donc redemander le mot de
 * passe, inline, plutôt que de laisser le serveur refuser après l'envoi.
 *
 * ⚠️ Ne concerne QUE les champs secrets. Une URL de base ou un mode d'auth restent
 * requis même sur un credential existant — ils sont pré-remplis, donc les vider est un
 * geste, pas un oubli, et un formulaire validable à blanc n'aurait plus de sens.
 *
 * D'où ça vient : la première version de ce lot a appris à l'ENVOI qu'un secret vide
 * se conserve, et a oublié de le dire à la VALIDATION. Le champ affichait « laisse
 * vide pour conserver » et se marquait requis en rouge — deux couches, deux avis
 * contraires, formulaire impossible à soumettre (oto-dashboard#126, 28/08). */
export function keptSecrets(
  fields: CredentialField[],
  discriminator: string | undefined,
  stored: Record<string, string> | undefined,
  existing: boolean,
): Set<string> {
  if (!existing) return new Set()
  return new Set(
    relevantFields(fields, discriminator, stored ?? {})
      .filter((f) => f.secret)
      .map((f) => f.name),
  )
}

/** Le champ doit-il être NON VIDE pour que le formulaire parte ?
 *
 * Seule source de cette réponse — la vue ne la recalcule pas. C'est exactement ce qui
 * a produit le défaut du 28/08 : le dialogue décidait « requis » sur le seul
 * `f.required` du registre, pendant que `payloadFor`, ici, avait déjà le droit
 * d'omettre le champ. Deux couches, deux avis contraires, formulaire impossible à
 * soumettre. L'invariant qui les relie est gravé dans le test de ce fichier. */
export function requiredAtInput(f: CredentialField, kept: Set<string>): boolean {
  return f.required !== false && !kept.has(f.name)
}

/** Un secret CONSERVÉ se saisit « à blanc » : on ne peut pas le relire, et le laisser
 * vide le garde. Le dire à l'écran, sinon l'utilisateur croit qu'il doit le retrouver
 * ailleurs — c'est ce qui a fait renoncer à un repointage.
 *
 * ⚠️ `kept` vient de `keptSecrets`, pas de « un credential existe ». Un secret qu'un
 * changement de mode vient de rendre nécessaire n'est PAS au coffre : lui promettre
 * qu'il sera conservé serait faux, et le formulaire le redemande. */
export function secretPlaceholder(f: CredentialField, kept: boolean): string {
  if (f.secret && kept) return 'déjà enregistré — laisse vide pour conserver'
  return f.help ?? ''
}

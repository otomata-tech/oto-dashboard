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
 * fichier : sur un credential qui existe déjà, **un champ secret laissé vide est
 * OMIS** — on ne peut pas le relire pour le pré-remplir, donc « vide » y veut dire
 * « je n'y touche pas », jamais « efface-le ».
 *
 * Les champs non secrets, eux, partent toujours : ils sont pré-remplis, l'utilisateur
 * les VOIT, et en vider un est un geste délibéré qu'il faut respecter.
 *
 * ⚠️ Renvoyer un secret vide sur un credential existant l'EFFACERAIT. C'est le piège
 * exact de ce lot (oto-dashboard#126) : le formulaire renvoyait tous ses champs, ce
 * qui était juste tant que le serveur remplaçait tout, et devient destructeur depuis
 * qu'il complète. */
export function payloadFor(
  fields: CredentialField[],
  values: Record<string, string>,
  opts: { existing: boolean },
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of fields) {
    const v = values[f.name] ?? ''
    if (v === '' && f.secret && opts.existing) continue
    out[f.name] = v
  }
  return out
}

/** Un champ secret d'un credential déjà posé se saisit « à blanc » : on ne peut pas
 * le relire, et le laisser vide le conserve. Le dire à l'écran, sinon l'utilisateur
 * croit qu'il doit le retrouver — c'est ce qui a fait renoncer à un repointage. */
export function secretPlaceholder(f: CredentialField, existing: boolean): string {
  if (f.secret && existing) return 'déjà enregistré — laisse vide pour conserver'
  return f.help ?? ''
}

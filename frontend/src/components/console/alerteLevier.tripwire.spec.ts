import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Tripwire : **une alerte qui réclame un geste doit offrir le moyen de l'accomplir.**
//
// Le défaut vécu, sur `/org/billing` : QUATRE alertes de la même famille demandaient une
// action que l'écran ne permettait pas. Le seul abonné payant de la plateforme a lu
// « complétez l'identité de facturation » pendant huit jours sans qu'aucun écran ne le
// lui permette — et son prélèvement suivant aurait échoué en silence. Ce n'était pas
// quatre oublis : c'était une classe, et une classe se ferme par un contrôle, pas par
// quatre correctifs.
//
// Ce que ce contrôle exige — et c'est volontairement le minimum : **que quelqu'un ait
// TRANCHÉ**. Une alerte `tone="warn"` porte soit son levier dans son propre cadre, soit
// une entrée ci-dessous qui dit pourquoi elle n'en a pas besoin. Une alerte neuve que
// personne n'a classée fait rougir ce test.
//
// ⚠️ Ce contrôle ne juge PAS la qualité du levier — aucune analyse statique ne le peut.
// Il empêche seulement qu'une alerte apparaisse sans que la question ait été posée.
//
// Deux raisons légitimes de n'avoir aucun levier :
//   • `informatif`     — rien n'est demandé au lecteur. Il constate, il n'agit pas.
//   • `levier-voisin`  — le geste est dans le MÊME cadre, immédiatement sous l'alerte
//                        (le champ fautif, le formulaire, le bouton de l'étape).
//
// La clé est `<fichier>#<rang de l'alerte dans le fichier>` : ajouter ou déplacer une
// alerte casse le test, et c'est exactement le moment où il faut re-trancher.
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const CLASSEES: Record<string, string> = {
  // Un paiement est EN VOL. Le geste juste est d'attendre — et c'est un bouton
  // reproposé ici qui a débité deux fois le premier client payant (#127). L'absence
  // de levier est le correctif, pas l'oubli.
  'components/console/billing/BillingCheckout.vue#0': 'informatif',
  // Refus du tunnel : le formulaire qui l'a produit est juste dessous, le geste est
  // de corriger puis de re-soumettre.
  'components/console/billing/BillingCheckout.vue#1': 'levier-voisin',
  // « indiquez votre numéro de TVA » — le champ est dans ce formulaire, sous l'alerte.
  'components/console/billing/BillingIdentityForm.vue#0': 'levier-voisin',
  'components/console/billing/BillingIdentityForm.vue#1': 'levier-voisin',
  // Pourquoi aucun montant n'est annonçable : la fiche d'identité est l'étape du même
  // tunnel, montée sur le même écran.
  'components/console/billing/BillingPriceCard.vue#0': 'levier-voisin',
  // Dépassement d'appels inclus : « rien n'est coupé, rien n'est facturé en plus ».
  // Rien n'est demandé — et la copie ne doit rien menacer.
  'components/console/billing/BillingUsageCard.vue#0': 'informatif',
  // Audience tronquée : un CONSTAT sur ce qui partira. Restreindre l'audience se fait
  // dans la carte « Campagne », au-dessus, et n'est pas ce qui est demandé ici.
  'components/console/outreach/OutreachRecipients.vue#0': 'informatif',
  // Le premier obstacle à l'envoi, écrit pour dire QUOI FAIRE — et les boutons qui
  // l'accomplissent (aperçu, essai, envoi) sont dans la même carte, sous l'alerte.
  'views/console/AdminOutreachView.vue#0': 'levier-voisin',
}
const RAISONS = new Set(['informatif', 'levier-voisin'])

// Un levier DANS le cadre de l'alerte : un bouton, un lien, un gestionnaire de clic.
const LEVIER = /<Btn|<router-link|@click|<a\s/
const ALERTE = /<Notice\b([^>]*)>([\s\S]*?)<\/Notice>/g

function walk(dir: string): string[] {
  const out: string[] = []
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

/** Les alertes `warn` du dossier, dans l'ordre du fichier. */
function alertes(): { cle: string; levier: boolean }[] {
  const out: { cle: string; levier: boolean }[] = []
  for (const file of walk(SRC)) {
    if (!file.endsWith('.vue')) continue
    const rel = relative(SRC, file).replace(/\\/g, '/')
    const src = readFileSync(file, 'utf8')
    let n = 0
    for (const m of src.matchAll(ALERTE)) {
      // `tone="warn"` ou `:tone="…'warn'…"` — le ton d'alerte, pas `info`/`ok`.
      if (!/warn/.test(m[1] ?? '')) continue
      out.push({ cle: `${rel}#${n++}`, levier: LEVIER.test(m[2] ?? '') })
    }
  }
  return out
}

describe('tripwire : une alerte qui réclame un geste offre le moyen de l\'accomplir', () => {
  it('toute alerte sans levier dans son cadre est classée, avec sa raison', () => {
    const orphelines = alertes()
      .filter((a) => !a.levier && !CLASSEES[a.cle])
      .map((a) => a.cle)
    expect(
      orphelines,
      'alerte(s) « warn » sans levier ET non classée(s). Ajoute le levier dans le cadre '
      + 'de l\'alerte, ou déclare-la ici avec sa raison (informatif | levier-voisin) : '
      + orphelines.join(', '),
    ).toEqual([])
  })

  it('aucune entrée périmée : une alerte classée existe encore, et sans levier', () => {
    // Une entrée qui ne correspond plus à rien laisserait croire qu'un cas a été
    // tranché alors qu'il a disparu ou changé de rang — le registre ment alors sur
    // ce qu'il couvre.
    const sansLevier = new Set(alertes().filter((a) => !a.levier).map((a) => a.cle))
    const perimees = Object.keys(CLASSEES).filter((k) => !sansLevier.has(k))
    expect(perimees, `entrées périmées à retirer : ${perimees.join(', ')}`).toEqual([])
  })

  it('chaque raison déclarée est l\'une des deux raisons admises', () => {
    for (const [cle, raison] of Object.entries(CLASSEES)) {
      expect(RAISONS.has(raison), `raison inconnue pour ${cle} : ${raison}`).toBe(true)
    }
  })
})

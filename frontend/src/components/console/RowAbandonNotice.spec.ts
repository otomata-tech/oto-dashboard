// Le motif d'abandon doit arriver à l'écran MOT POUR MOT. Un test sur la seule
// fonction de lecture ne le prouve pas : c'est le rendu qui pourrait le tronquer,
// le capitaliser ou le remplacer par une phrase maison. On rend donc le composant
// et on lit la sortie.
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import RowAbandonNotice from './RowAbandonNotice.vue'
import type { AbandonVerdict } from '@/lib/datastoreClaims'

// La chaîne littérale du serveur (`_MOTIF` d'oto-backend), accord au singulier compris.
const MOTIF = 'abandonnée après 1 réservations sans écriture, plafond 1'

const render = (verdict: AbandonVerdict, canWrite: boolean) =>
  renderToString(createSSRApp({
    render: () => h(RowAbandonNotice, { verdict, canWrite }),
  }))

describe('RowAbandonNotice', () => {
  it('affiche le motif du serveur sans le retoucher', async () => {
    const html = await render({ reason: MOTIF, reopens: ['a_traiter'] }, true)
    expect(html).toContain(MOTIF)
  })

  it('annonce le statut gelé quand aucun retour n\'est déclaré', async () => {
    const html = await render({ reason: MOTIF, reopens: [] }, true)
    expect(html).toContain('aucun retour depuis cet état')
  })

  it('ne promet pas la réparation à qui ne peut pas écrire', async () => {
    // « Jamais de levier inerte » : un lecteur seul n'a pas l'écriture qui rouvrirait
    // la ligne — lui décrire le geste l'enverrait buter sur un refus.
    const html = await render({ reason: MOTIF, reopens: [] }, false)
    expect(html).toContain(MOTIF)
    expect(html).not.toContain('Une écriture réussie')
  })
})

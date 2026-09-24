// Le parcours d'une fiche (oto#273, M3) monté pour de vrai : une entrée avec révisions
// montre les valeurs « avant → après » ; une entrée d'un backend antérieur garde les noms
// de colonnes et son badge ; `kind: revision` n'a pas d'outil et n'est pas « agent » ;
// le vide dit que le journal des valeurs ne couvre que depuis le 24/09/2026.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { i18n } from '@/lib/i18n'
import type { RowActivityEntry } from '@/types/api'

const api = vi.hoisted(() => ({ getRowActivity: vi.fn() }))
vi.mock('@/api/console', () => api)

const base: RowActivityEntry = {
  created_at: '2026-09-24 10:00:00', kind: 'mcp', tool: 'data_write', ok: true, error: null,
  sub: 'usr_a', email: 'a@ex.fr', run_id: null, run_label: null, doctrine: null, outcome: null,
  row_id: 'r1', row_title: null, fields: ['nom', 'ville'], from_status: null, to_status: null,
}

async function settle() {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 10))
  for (let i = 0; i < 5; i++) await nextTick()
}

let hote: HTMLElement
beforeEach(() => { i18n.global.locale.value = 'fr'; hote = document.createElement('div'); document.body.appendChild(hote) })
afterEach(() => { hote.remove(); api.getRowActivity.mockReset() })

async function monter(activity: RowActivityEntry[]) {
  api.getRowActivity.mockResolvedValue({ activity, key: null, retention_days: 30 })
  const List = (await import('./RowActivityList.vue')).default
  const app = createApp(List, { datastore: '12', rowId: 'r1' }).use(i18n)
  app.mount(hote)
  await settle()
  return app
}

describe('RowActivityList', () => {
  it('une entrée avec révisions : une pastille par colonne, avant → après', async () => {
    const app = await monter([{
      ...base, kind: 'rest', tool: 'data_update', source: 'console', geste_id: 'g1', acteur: 'usr_a',
      revisions: [{ rev: 2, at: base.created_at, acteur: 'usr_a', source: 'console', geste_id: 'g1',
        diff: { ville: { avant: 'Paris', apres: { valeur: 'Lyon', comment: 'vu sur le site' } }, cherche: { apres: { valeur: '@empty' } } } }],
    }])
    const pastilles = [...hote.querySelectorAll('[data-test="value-change"]')].map((e) => [...e.children].map((c) => c.textContent!.trim()).join(' '))
    expect(pastilles).toEqual(['cherche (absent) → vide assumé', 'ville Paris → Lyon + note'])
    expect(hote.textContent).toContain('console')
    expect(hote.textContent).not.toContain('nom, ville')
    app.unmount()
  })

  it('backend ancien (sans les nouveaux champs) : noms de colonnes et badge « agent »', async () => {
    const app = await monter([base])
    expect(hote.querySelector('[data-test="value-change"]')).toBeNull()
    expect(hote.textContent).toContain('nom, ville')
    expect(hote.querySelector('.tag')!.textContent!.trim()).toBe('agent')
    expect(hote.textContent).toContain('data_write')
    app.unmount()
  })

  it('`kind: revision` : pas d\'outil affiché, l\'origine est la source', async () => {
    const app = await monter([{
      ...base, kind: 'revision', tool: null, sub: null, email: null, source: 'upload', acteur: 'service:upload',
      revisions: [{ rev: 3, at: base.created_at, acteur: 'service:upload', source: 'upload', geste_id: null,
        diff: { n: { avant: 1, apres: 2 } } }],
    }])
    expect(hote.querySelector('.tag')!.textContent!.trim()).toBe('fichier')
    expect(hote.querySelector('code')).toBeNull()
    expect(hote.textContent).toContain('service:upload')
    app.unmount()
  })

  it('le vide dit la couverture du journal des valeurs', async () => {
    const app = await monter([])
    expect(hote.querySelector('[data-test="activity-empty"]')!.textContent).toContain('24/09/2026')
    app.unmount()
  })
})

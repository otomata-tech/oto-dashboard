// En-tête d'une page (24/09/2026) : fil d'Ariane des pages parentes, titre renommable en
// place seulement quand on peut écrire, et le levier du conflit dans sa phrase.
import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import DocPageHead from './DocPageHead.vue'
import type { Doc } from '@/types/api'

const d = (id: number, parent_id: number | null, title: string) =>
  ({ id, project_id: 5, parent_id, title, body_md: '', kind: 'doc', updated_at: '2026-09-24T09:00:00' }) as Doc

function monter(props: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const events: Record<string, unknown[]> = {}
  const on = (n: string) => (...a: unknown[]) => { events[n] = a }
  const app = createApp({ render: () => h(DocPageHead as never, { ...props, onRename: on('rename'), onOpenDoc: on('open-doc'), onReload: on('reload') }) })
  app.mount(host)
  return { host, events, cleanup: () => { app.unmount(); host.remove() } }
}

describe('DocPageHead', () => {
  const docs = [d(1, null, 'Racine'), d(2, 1, 'Dossiers'), d(3, 2, 'Chiffrage')]

  it('fil d’Ariane : le projet puis les pages parentes, de la plus haute à la plus proche', () => {
    const m = monter({ projectName: 'Projet A', doc: docs[2], docs })
    const fil = m.host.querySelector('nav')!.textContent!.replace(/\s+/g, '')
    expect(fil).toBe('ProjetA›Racine›Dossiers')
    m.host.querySelectorAll<HTMLButtonElement>('nav button')[1]!.click()
    expect(m.events['open-doc']).toEqual([2])
    m.cleanup()
  })

  it('renomme en place : Entrée enregistre le nouveau titre', async () => {
    const m = monter({ projectName: 'P', doc: docs[2], docs })
    m.host.querySelector<HTMLElement>('h3')!.click()
    await nextTick()
    const input = m.host.querySelector<HTMLInputElement>('input')!
    input.value = 'Chiffrage v2'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(m.events['rename']).toEqual(['Chiffrage v2'])
    m.cleanup()
  })

  it('en lecture seule, le titre ne s’ouvre pas', async () => {
    const m = monter({ projectName: 'P', doc: docs[2], docs, readOnly: true })
    m.host.querySelector<HTMLElement>('h3')!.click()
    await nextTick()
    expect(m.host.querySelector('input')).toBeNull()
    m.cleanup()
  })

  it('conflit : la phrase porte le geste qui recharge', () => {
    const m = monter({ projectName: 'P', doc: docs[2], docs, status: 'conflict' })
    expect(m.host.textContent).toContain('modifiée ailleurs')
    ;[...m.host.querySelectorAll('button')].find((b) => b.textContent?.includes('recharge'))!.click()
    expect(m.events['reload']).toEqual([])
    m.cleanup()
  })
})

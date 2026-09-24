// Le tableau commun des écrans console : recherche et tri (24/09/2026). Chaque vue
// bricolait son filtre à côté, et aucune liste ne se triait.
import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import ConsoleTable from './ConsoleTable.vue'
import SortTh from './SortTh.vue'

type Row = { name: string; n: number | null }
const ROWS: Row[] = [{ name: 'Céleste', n: 3 }, { name: 'bob', n: null }, { name: 'Alice', n: 10 }]

async function monter() {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(ConsoleTable as never, {
    rows: ROWS, search: (r: Row) => r.name,
    sorts: { nom: (r: Row) => r.name, n: (r: Row) => r.n },
    defaultSort: { key: 'nom', dir: 'asc' },
  }, {
    head: ({ sort }: { sort: unknown }) => [h(SortTh as never, { k: 'nom', sort }, () => 'nom'), h(SortTh as never, { k: 'n', sort }, () => 'n')],
    row: ({ row }: { row: Row }) => h('tr', [h('td', row.name)]),
  }) })
  app.mount(host)
  await nextTick()
  const noms = () => [...host.querySelectorAll('tbody td')].map((td) => td.textContent)
  return { host, noms, app }
}

describe('ConsoleTable — recherche et tri', () => {
  it('trie par défaut, sans casse, à la française', async () => {
    const { noms, app } = await monter()
    expect(noms()).toEqual(['Alice', 'bob', 'Céleste'])
    app.unmount()
  })

  it('un clic trie sur la colonne, un second inverse ; une valeur absente reste en fin', async () => {
    const { host, noms, app } = await monter()
    const th = host.querySelectorAll<HTMLButtonElement>('th button')[1]!
    th.click(); await nextTick()
    expect(noms()).toEqual(['Céleste', 'Alice', 'bob'])
    th.click(); await nextTick()
    expect(noms()).toEqual(['Alice', 'Céleste', 'bob'])
    app.unmount()
  })

  it('cherche sans accents, et dit quand rien ne correspond', async () => {
    const { host, noms, app } = await monter()
    const input = host.querySelector('input')!
    input.value = 'celeste'; input.dispatchEvent(new Event('input')); await nextTick()
    expect(noms()).toEqual(['Céleste'])
    input.value = 'zzz'; input.dispatchEvent(new Event('input')); await nextTick()
    expect(host.textContent).toContain('aucun résultat pour « zzz »')
    app.unmount()
  })
})

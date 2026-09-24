// Le refus du schéma s'affiche sous le sous-champ exact de l'élément en cause (oto#219), au
// lieu d'une phrase en tête de fiche.
import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import SubRecordEditor from './SubRecordEditor.vue'
import { elementSaisi } from '@/lib/rowDraft'
import { i18n } from '@/lib/i18n'

const FIELD = { key: 'contacts', type: 'list', of: { fields: [
  { key: 'email', type: 'email', required: true }, { key: 'age', type: 'number' }] } }

describe('SubRecordEditor — erreurs par élément', () => {
  it('l’erreur tombe sous le champ de l’élément désigné, et nulle part ailleurs', async () => {
    const host = document.createElement('div')
    const app = createApp({ render: () => h(SubRecordEditor as never, {
      field: FIELD,
      modelValue: { sorte: 'elements', elements: [elementSaisi({ email: 'a@b.fr', age: 3 }), elementSaisi({ email: '', age: 'abc' })] },
      erreurs: { 1: { age: 'à corriger : attendu <nombre>' } },
    }) })
    app.use(i18n).mount(host)
    await nextTick()
    const items = host.querySelectorAll('.sre-item')
    expect(items[0]!.querySelector('.sre-err')).toBeNull()
    const cell = items[1]!.querySelector('[data-cell="age"]')!
    expect(cell.querySelector('.sre-err')?.textContent).toBe('à corriger : attendu <nombre>')
    expect(items[1]!.querySelector('[data-cell="email"] .sre-err')).toBeNull()
    app.unmount()
  })
})

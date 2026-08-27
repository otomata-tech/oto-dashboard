import { describe, it, expect } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { usePlatformAdapter } from './usePlatformAdapter'
import { useMe } from '@/composables/useMe'
import type { Me } from '@/types/api'
import type { ScopeCtx } from './adapter'

// Le lever ne consomme pas ctx à la construction (uniquement dans load/toggle/addKey) —
// un stub no-op suffit pour observer le drapeau d'accès plateforme.
const stubCtx: ScopeCtx = {
  openForm: () => {},
  openCredential: () => {},
  confirmAction: async () => false,
  toast: () => {},
}

const SUPER = { role: 'super_admin' } as unknown as Me

// Monte un composant minimal qui rend un marqueur SSI le picker de grant est ouvert —
// exactement le `v-if="isSuperAdmin"` du panneau, alimenté par le lever de l'adaptateur.
function mountGate() {
  const el = document.createElement('div')
  const app = createApp(defineComponent({
    setup() {
      const adapter = usePlatformAdapter(stubCtx)
      const lever = adapter.platformAccess!  // cet adaptateur retourne toujours le lever plateforme
      return () => h('div', lever.isSuperAdmin ? [h('span', { class: 'grant-picker' })] : [])
    },
  }))
  app.mount(el)
  return { el, app }
}

// oto-dashboard#122 : `me` est chargé de façon asynchrone par le shell ; si l'écran
// s'ouvre à froid, l'adaptateur est construit AVANT que le profil arrive. Un drapeau
// d'autz figé au montage resterait à `false` et masquerait le seul contrôle d'ouverture,
// même pour un super_admin. Le getter réactif le corrige.
describe('usePlatformAdapter — accès plateforme (#122)', () => {
  it('révèle le picker de grant quand `me` se charge APRÈS le montage', async () => {
    const { me } = useMe()
    me.value = null
    const { el, app } = mountGate()
    expect(el.querySelector('.grant-picker')).toBeNull()

    me.value = SUPER
    await nextTick()
    expect(el.querySelector('.grant-picker')).not.toBeNull()

    app.unmount()
    me.value = null
  })
})

// Édition en place d'une page (24/09/2026) : ce que l'enregistrement automatique promet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { ApiError } from '@/api'

const api = vi.hoisted(() => ({
  getDoc: vi.fn(async () => ({ id: 1, rev: 'r1' })),
  updateDoc: vi.fn(async () => ({ id: 1, rev: 'r2' })),
}))
vi.mock('@/api/console', () => api)

import { IDLE_MS, useDocAutosave } from './useDocAutosave'
import type { Doc } from '@/types/api'

const DOC = { id: 1, project_id: 5, parent_id: null, title: 'Brief', body_md: 'a', kind: 'doc', description: '' } as Doc

async function settle() { for (let i = 0; i < 6; i++) { await Promise.resolve(); await nextTick() } }

describe('useDocAutosave', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks() })
  afterEach(() => { vi.useRealTimers() })

  it('écrit après une pause de frappe, avec la révision lue', async () => {
    const saved = vi.fn()
    const a = useDocAutosave(ref(DOC), saved)
    a.start()
    a.draft.value!.body_md = 'ab'
    await nextTick()
    expect(a.status.value).toBe('pending')
    await vi.advanceTimersByTimeAsync(IDLE_MS - 10)
    expect(api.updateDoc).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(20)
    await settle()
    expect(api.updateDoc).toHaveBeenCalledWith(1, expect.objectContaining({ body_md: 'ab', expected_rev: 'r1' }))
    expect(a.status.value).toBe('saved')
    expect(saved).toHaveBeenCalledTimes(1)
  })

  it('quitter l’écriture enregistre tout de suite et rend la lecture', async () => {
    const a = useDocAutosave(ref(DOC), () => {})
    a.start()
    a.draft.value!.body_md = 'abc'
    await nextTick()
    await a.stop()
    expect(api.updateDoc).toHaveBeenCalledTimes(1)
    expect(a.editing.value).toBe(false)
  })

  it('conflit : n’écrase rien, ne réessaie pas, reste en écriture', async () => {
    api.updateDoc.mockRejectedValueOnce(new ApiError(409, 'conflict'))
    const a = useDocAutosave(ref(DOC), () => {})
    a.start()
    a.draft.value!.body_md = 'x'
    await nextTick()
    await a.stop()
    expect(a.status.value).toBe('conflict')
    expect(a.editing.value).toBe(true)
    a.draft.value!.body_md = 'xy'
    await nextTick()
    await vi.advanceTimersByTimeAsync(IDLE_MS * 2)
    expect(api.updateDoc).toHaveBeenCalledTimes(1)
  })

  it('renommer depuis l’en-tête écrit le seul titre, sans ouvrir l’écriture', async () => {
    const a = useDocAutosave(ref(DOC), () => {})
    await a.saveTitle('Brief v2')
    expect(api.updateDoc).toHaveBeenCalledWith(1, expect.objectContaining({ title: 'Brief v2', body_md: 'a' }))
    expect(a.editing.value).toBe(false)
  })
})

// Archiver un projet qui porte un brief ou une procédure liée (oto#38) : le serveur
// refuse (409 `confirm_required`), la page demande confirmation avec ce qui deviendra
// injoignable, et rejoue l'appel avec `confirm: true` — jamais sans l'accord.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { ApiError } from '@/api'
import { usePrompt } from '@/composables/usePrompt'

const api = vi.hoisted(() => ({ archiveProject: vi.fn() }))
vi.mock('@/api/console', () => api)

import { archiveWithConfirm, describeUnreachable } from './projectArchive'

const UNREACHABLE = { pages: 3, procedures: 1, links: 4, brief: true }
const refus = () => new ApiError(409, 'confirm_required', 'Archiver #7…', { unreachable: UNREACHABLE })

async function confirmationOuverte() {
  await nextTick(); await nextTick()
  const s = usePrompt().state.value
  if (s?.kind !== 'confirm') throw new Error('aucune confirmation ouverte')
  return s.config
}

describe('archiveWithConfirm', () => {
  beforeEach(() => { api.archiveProject.mockReset(); usePrompt().resolve(false) })

  it('refus 409, confirmation dans la page, puis nouvel appel avec confirm: true', async () => {
    api.archiveProject.mockRejectedValueOnce(refus()).mockResolvedValueOnce({ ok: true, archived: true })
    const fait = archiveWithConfirm(7, 'Mission Alpha')

    const cfg = await confirmationOuverte()
    expect(cfg.title).toBe('Archiver « Mission Alpha » ?')
    expect(cfg.message).toContain('3 pages, 1 procédure liée, 4 liens et son brief')
    expect(cfg.danger).toBe(true)
    expect(api.archiveProject).toHaveBeenCalledTimes(1)

    usePrompt().resolve(true)
    await expect(fait).resolves.toBe(true)
    expect(api.archiveProject.mock.calls).toEqual([[7], [7, true]])
  })

  it('renoncer n’archive rien', async () => {
    api.archiveProject.mockRejectedValueOnce(refus())
    const fait = archiveWithConfirm(7, 'Mission Alpha')
    await confirmationOuverte()
    usePrompt().resolve(false)
    await expect(fait).resolves.toBe(false)
    expect(api.archiveProject.mock.calls).toEqual([[7]])
  })

  it('sans refus, archive d’emblée sans rien demander', async () => {
    api.archiveProject.mockResolvedValueOnce({ ok: true, archived: true })
    await expect(archiveWithConfirm(7, 'Vide')).resolves.toBe(true)
    expect(usePrompt().state.value).toBeNull()
    expect(api.archiveProject.mock.calls).toEqual([[7]])
  })

  it('un autre refus remonte tel quel', async () => {
    const e = new ApiError(403, 'forbidden')
    api.archiveProject.mockRejectedValueOnce(e)
    await expect(archiveWithConfirm(7, 'X')).rejects.toBe(e)
    expect(usePrompt().state.value).toBeNull()
  })

  it('un 409 confirm_required sans `details.unreachable` est un contrat rompu : il remonte', async () => {
    const e = new ApiError(409, 'confirm_required')
    api.archiveProject.mockRejectedValueOnce(e)
    await expect(archiveWithConfirm(7, 'X')).rejects.toBe(e)
  })
})

describe('describeUnreachable', () => {
  it('accorde au singulier et omet le brief absent', () => {
    expect(describeUnreachable({ pages: 1, procedures: 0, links: 1, brief: false }))
      .toBe('1 page, 0 procédure liée et 1 lien')
  })
})

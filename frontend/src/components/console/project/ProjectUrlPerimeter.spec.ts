// Périmètre d'URL (oto-dashboard#134) : ajout/retrait de motifs, et le refus de
// pose s'affiche MOT POUR MOT (le message écrit par le backend, pas une
// traduction générique) — c'est le point que l'issue demandait explicitement.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, nextTick } from 'vue'
import ProjectUrlPerimeter from './ProjectUrlPerimeter.vue'
import { ApiError } from '@/api'

const updateProject = vi.fn()
vi.mock('@/api/console', () => ({ updateProject: (...args: unknown[]) => updateProject(...args) }))

async function mountCard(prefixes: string[], opts: { readOnly?: boolean; onChanged?: () => void } = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(ProjectUrlPerimeter, {
    projectId: 42, prefixes, readOnly: opts.readOnly, onChanged: opts.onChanged,
  })
  app.mount(host)
  await nextTick()
  return { host, unmount: () => { app.unmount(); host.remove() } }
}

function chipTexts(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.pup-chip__txt')].map((n) => n.textContent ?? '')
}

// La pose chaîne plusieurs `await` (persist → updateProject → merge du résultat) —
// un seul `nextTick()` ne garantit pas d'avoir drainé toute la chaîne.
async function flush() {
  for (let i = 0; i < 6; i++) await nextTick()
}

describe('ProjectUrlPerimeter', () => {
  beforeEach(() => { updateProject.mockReset() })

  it('affiche les motifs existants', async () => {
    const { host, unmount } = await mountCard(['linkedin.com/in/'])
    expect(chipTexts(host)).toEqual(['linkedin.com/in/'])
    unmount()
  })

  it('lecture seule : ni bouton de retrait ni formulaire d\'ajout', async () => {
    const { host, unmount } = await mountCard(['linkedin.com/in/'], { readOnly: true })
    expect(host.querySelector('.pup-chip__x')).toBeNull()
    expect(host.querySelector('.pup-add')).toBeNull()
    unmount()
  })

  it('ajoute un motif — pose la liste complète, vide le brouillon, émet `changed`', async () => {
    updateProject.mockResolvedValue({ excluded_url_prefixes: ['linkedin.com/in/', 'exemple.fr/*'] })
    const onChanged = vi.fn()
    const { host, unmount } = await mountCard(['linkedin.com/in/'], { onChanged })
    const input = host.querySelector<HTMLInputElement>('.pup-in')!
    input.value = 'exemple.fr/*'
    input.dispatchEvent(new Event('input'))
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await flush()

    expect(updateProject).toHaveBeenCalledWith(42, { excluded_url_prefixes: ['linkedin.com/in/', 'exemple.fr/*'] })
    expect(chipTexts(host)).toEqual(['linkedin.com/in/', 'exemple.fr/*'])
    expect(input.value).toBe('')
    expect(onChanged).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('retire un motif — pose la liste sans lui', async () => {
    updateProject.mockResolvedValue({ excluded_url_prefixes: ['exemple.fr/*'] })
    const { host, unmount } = await mountCard(['linkedin.com/in/', 'exemple.fr/*'])
    const firstRemove = host.querySelectorAll<HTMLButtonElement>('.pup-chip__x')[0]!
    firstRemove.click()
    await flush()

    expect(updateProject).toHaveBeenCalledWith(42, { excluded_url_prefixes: ['exemple.fr/*'] })
    expect(chipTexts(host)).toEqual(['exemple.fr/*'])
    unmount()
  })

  it('refus de pose : affiche le message du backend tel quel, ne touche pas à la liste ni au brouillon', async () => {
    updateProject.mockRejectedValue(new ApiError(400, 'invalid_url_prefix',
      '`excluded_url_prefixes` : un hôte nu est refusé — écris `exemple.fr/*` pour tout le site.'))
    const { host, unmount } = await mountCard(['linkedin.com/in/'])
    const input = host.querySelector<HTMLInputElement>('.pup-in')!
    input.value = 'exemple.fr'
    input.dispatchEvent(new Event('input'))
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await flush()

    expect(host.querySelector('.pup-err')?.textContent)
      .toBe('`excluded_url_prefixes` : un hôte nu est refusé — écris `exemple.fr/*` pour tout le site.')
    expect(chipTexts(host)).toEqual(['linkedin.com/in/'])
    expect(input.value).toBe('exemple.fr')
    unmount()
  })
})

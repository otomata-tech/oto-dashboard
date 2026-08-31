// oto-dashboard#135 : le backend (oto-backend#624) refuse désormais une invitation
// d'org avec 409 `already_member` / `already_invited` — jusqu'ici le dashboard
// perdait le message rédigé par le serveur derrière `humanize()` (aucune clé i18n
// pour ces codes neufs ⟹ le code brut "409 already_invited" s'affichait). On
// vérifie ici que le `detail` backend s'affiche VERBATIM, et que `already_invited`
// propose bien « resend » (révoquer l'existante puis ré-émettre) à partir de
// `details.invitation.id` — sans faire retaper le formulaire.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { ApiError } from '@/api'
import { useToast } from '@/composables/useToast'
import type { InviteResult, OrgRole } from '@/types/api'

const listInvitations = vi.fn(async (_id: number) => ({ invitations: [] as unknown[] }))
const inviteMember = vi.fn<
  (id: number, email: string | null, role: OrgRole, sendEmail?: boolean) => Promise<InviteResult & { role: string }>
>()
const revokeInvitation = vi.fn(async (_id: number, _inviteId: number) => ({}))

// Référencées par le factory ci-dessous — vitest hoiste `vi.mock`, mais son
// exécution (au premier import de `@/api/console`) est différée jusqu'au dynamic
// `import('./InvitationsCard.vue')` de `mountCard()`, bien après ces `const`.
vi.mock('@/api/console', () => ({ listInvitations, inviteMember, revokeInvitation }))

async function mountCard() {
  const InvitationsCard = (await import('./InvitationsCard.vue')).default
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(InvitationsCard, { scope: { level: 'org', id: 7 }, canManage: true })
  app.mount(host)
  await nextTick()
  return { host, cleanup: () => { app.unmount(); host.remove() } }
}

async function type(el: HTMLInputElement | null, value: string) {
  if (!el) throw new Error('champ email introuvable')
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
}

async function flush(times = 8) {
  for (let i = 0; i < times; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
  }
}

async function openAndSubmit(host: HTMLElement, email: string) {
  const openBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Invite'))
  openBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await nextTick()
  await type(document.querySelector<HTMLInputElement>('input[name="email"]'), email)
  document.querySelector<HTMLFormElement>('form')
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
}

describe('InvitationsCard — 409 already_member / already_invited (oto-dashboard#135)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    listInvitations.mockClear()
    inviteMember.mockReset()
    revokeInvitation.mockClear()
    useToast().dismissToast()
  })

  it('already_member : affiche le detail backend verbatim, sans action de renvoi', async () => {
    inviteMember.mockRejectedValueOnce(new ApiError(
      409, 'already_member', 'a@b.invalid est déjà membre de cette org : rien à inviter.',
    ))
    const { host, cleanup } = await mountCard()
    await openAndSubmit(host, 'a@b.invalid')

    const { message, action } = useToast()
    expect(message.value).toBe('a@b.invalid est déjà membre de cette org : rien à inviter.')
    expect(action.value).toBeNull()
    cleanup()
  })

  it('already_invited : montre le detail (avec l\'id) et propose resend', async () => {
    inviteMember.mockRejectedValueOnce(new ApiError(
      409, 'already_invited',
      'a@b.invalid a déjà une invitation en attente (#42, expire le 2026-09-10) : '
      + 'la renvoyer ou la révoquer plutôt qu’en émettre une deuxième.',
      { invitation: { id: 42, created_at: '2026-09-01', expires_at: '2026-09-10' } },
    ))
    const { host, cleanup } = await mountCard()
    await openAndSubmit(host, 'a@b.invalid')

    const { message, action } = useToast()
    expect(message.value).toContain('#42')
    expect(message.value).not.toBe('409 already_invited')
    expect(action.value?.label).toBe('resend')
    cleanup()
  })

  it('resend : révoque l\'invitation existante puis ré-émet la même demande', async () => {
    inviteMember.mockRejectedValueOnce(new ApiError(
      409, 'already_invited', 'a@b.invalid a déjà une invitation en attente (#42, expire le 2026-09-10).',
      { invitation: { id: 42, created_at: '2026-09-01', expires_at: '2026-09-10' } },
    ))
    inviteMember.mockResolvedValueOnce({
      ok: true, email: 'a@b.invalid', role: 'org_member', code: 'c', invite_url: 'https://x', emailed: true,
    })
    const { host, cleanup } = await mountCard()
    await openAndSubmit(host, 'a@b.invalid')

    const { action, runToastAction, message } = useToast()
    expect(action.value?.label).toBe('resend')
    await runToastAction()
    await flush()

    expect(revokeInvitation).toHaveBeenCalledWith(7, 42)
    expect(inviteMember).toHaveBeenCalledTimes(2)
    expect(inviteMember).toHaveBeenLastCalledWith(7, 'a@b.invalid', 'org_member', true)
    expect(message.value).toBe('invite sent to a@b.invalid')
    cleanup()
  })
})

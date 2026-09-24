// Signaux d'usage au scope d'une ORG (23/09/2026, repris d'oto-frontend) : le panneau de la
// plateforme, l'org en paramètre. Ce test tient l'aiguillage — l'org ne lit jamais les
// routes plateforme, que son admin n'a pas le droit de lire.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const vide = { runs: [], gaps: [], tools: [], signals: [] }
const api = vi.hoisted(() => ({
  getUsageRuns: vi.fn(async () => ({ runs: [] })), getUsageRun: vi.fn(),
  getUsageGaps: vi.fn(async () => ({ gaps: [] })), getUsageToolQuality: vi.fn(async () => ({ tools: [] })),
  getUsageSignals: vi.fn(),
  getOrgUsageRuns: vi.fn(async () => ({ runs: [] })), getOrgUsageRun: vi.fn(),
  getOrgUsageGaps: vi.fn(async () => ({ gaps: [] })), getOrgUsageToolQuality: vi.fn(async () => ({ tools: [] })),
  getOrgUsageSignals: vi.fn(),
}))
vi.mock('@/api/console', () => api)

import UsageView from './UsageView.vue'
import { i18n } from '@/lib/i18n'

async function monter(props: Record<string, unknown>) {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(UsageView as never, props) })
  app.use(i18n).mount(host)
  for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() }
  return app
}

describe('UsageView — le niveau en paramètre', () => {
  beforeEach(() => { vi.clearAllMocks(); void vide })

  it('avec une org : les lentilles de CETTE org, fenêtre comprise', async () => {
    const app = await monter({ orgId: 42, windowDays: 30 })
    expect(api.getOrgUsageRuns).toHaveBeenCalledWith(42)
    expect(api.getOrgUsageGaps).toHaveBeenCalledWith(42, 30)
    expect(api.getOrgUsageToolQuality).toHaveBeenCalledWith(42, 30)
    expect(api.getUsageRuns).not.toHaveBeenCalled()
    expect(api.getUsageGaps).not.toHaveBeenCalled()
    app.unmount()
  })

  it('sans org : la plateforme, comme avant', async () => {
    const app = await monter({ windowDays: 7 })
    expect(api.getUsageGaps).toHaveBeenCalledWith(7)
    expect(api.getOrgUsageGaps).not.toHaveBeenCalled()
    app.unmount()
  })
})

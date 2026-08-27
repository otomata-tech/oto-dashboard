// Un bloc de code d'une doc connecteur doit rester COPIABLE À L'IDENTIQUE.
//
// Le rendu markdown-lite traitait le corps ligne à ligne : indentation perdue,
// lignes vides supprimées, et chaque `- scope` d'un YAML transformé en puce. Un
// manifeste d'app Slack rendu ainsi ne s'installe pas — il produit une erreur de
// validation chez le fournisseur, sans que rien n'indique que c'est le rendu qui
// l'a abîmé. D'où le découpage en blocs AVANT tout traitement inline.
import { describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import DocSections from './DocSections.vue'

const MANIFESTE = `oauth_config:
  scopes:
    bot:
      - channels:read
      - chat:write`

function render(body: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(() =>
    h(DocSections, { sections: [{ kind: 'setup', title: 'créer l’app', body_md: body }] }))
  app.mount(host)
  return {
    host,
    pre: () => host.querySelector('pre'),
    puces: () => host.querySelectorAll('.ds-li').length,
    cleanup: () => { app.unmount(); host.remove() },
  }
}

describe('DocSections — blocs de code', () => {
  it('rend le bloc À L’IDENTIQUE, indentation et lignes comprises', () => {
    const r = render(`colle ceci :\n\n\`\`\`yaml\n${MANIFESTE}\n\`\`\`\n\npuis installe.`)
    expect(r.pre()?.textContent).toBe(MANIFESTE)
    r.cleanup()
  })

  it('ne prend pas les tirets du YAML pour des puces', () => {
    const r = render(`\`\`\`yaml\n${MANIFESTE}\n\`\`\``)
    expect(r.puces()).toBe(0)
    r.cleanup()
  })

  it('garde le texte autour du bloc, avant comme après', () => {
    const r = render(`avant\n\n\`\`\`yaml\n${MANIFESTE}\n\`\`\`\n\naprès`)
    const txt = r.host.textContent ?? ''
    expect(txt).toContain('avant')
    expect(txt).toContain('après')
    r.cleanup()
  })

  it('propose de copier le bloc — personne ne retape vingt lignes de YAML', () => {
    const r = render(`\`\`\`yaml\n${MANIFESTE}\n\`\`\``)
    expect(r.host.querySelector('.ds-copy')?.textContent?.trim()).toBe('copier')
    r.cleanup()
  })

  it('un bloc NON REFERMÉ ne mange pas la suite du corps', () => {
    const r = render('avant\n\n```yaml\nkey: value\n\nla suite du texte')
    expect(r.pre()).toBeNull()
    expect(r.host.textContent).toContain('la suite du texte')
    r.cleanup()
  })

  it('une doc sans bloc rend exactement comme avant (puces incluses)', () => {
    const r = render('intro\n- premier\n- second')
    expect(r.pre()).toBeNull()
    expect(r.puces()).toBe(2)
    r.cleanup()
  })
})

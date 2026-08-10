<script lang="ts">
// Renderer markdown minimal (le sous-ensemble qu'une doctrine emploie : titres
// `##`, listes `-`, **gras**, `code`, et marqueurs <tool:slug> rendus en chips).
// Pas de dépendance markdown : le périmètre est volontairement étroit et sûr.
import { defineComponent, h, type PropType, type VNode } from 'vue'
import ToolChip from './ToolChip.vue'
import type { ToolReg } from './tools'

export default defineComponent({
  name: 'DoctrineContent',
  props: {
    text: { type: String, default: '' },
    reg: { type: Object as PropType<ToolReg>, required: true },
  },
  setup(props) {
    const parseInline = (text: string, kp: string): (VNode | string)[] => {
      const parts = text.split(/(<tool:[a-z0-9_]+>|\*\*[^*]+\*\*|`[^`]+`)/g)
      const nodes: (VNode | string)[] = []
      parts.forEach((p, i) => {
        if (!p) return
        let m: RegExpMatchArray | null
        if ((m = p.match(/^<tool:([a-z0-9_]+)>$/))) {
          nodes.push(h(ToolChip, { name: m[1] ?? '', reg: props.reg, key: `${kp}c${i}` }))
        } else if ((m = p.match(/^\*\*([^*]+)\*\*$/))) {
          nodes.push(h('strong', { key: `${kp}b${i}` }, m[1] ?? ''))
        } else if ((m = p.match(/^`([^`]+)`$/))) {
          nodes.push(h('code', { key: `${kp}m${i}`, class: 'oto-inline-code' }, m[1] ?? ''))
        } else {
          nodes.push(p)
        }
      })
      return nodes
    }

    return () => {
      const lines = (props.text || '').split('\n')
      const blocks: VNode[] = []
      let headings = 0
      // Paragraphe en cours d'accumulation. En markdown, les lignes consécutives d'un
      // paragraphe se JOIGNENT — seule une ligne vide (ou un titre, ou une puce) le
      // ferme. Rendre une ligne source = un <p> hachait le texte de tout auteur qui
      // wrappe à 80 colonnes, et forçait à écrire un paragraphe sur une seule ligne.
      let para: string[] = []
      let paraAt = 0

      const flush = () => {
        if (!para.length) return
        blocks.push(h('p', { key: `p${paraAt}`, class: 'oto-p' },
                      parseInline(para.join(' '), `p${paraAt}`)))
        para = []
      }

      lines.forEach((ln, i) => {
        if (/^##\s+/.test(ln)) {
          flush()
          headings += 1
          blocks.push(
            h('div', { key: `h${i}`, class: 'oto-h', style: { margin: `${blocks.length ? 20 : 0}px 0 6px` } }, [
              h('span', { class: 'oto-h__n' }, String(headings).padStart(2, '0')),
              h('span', null, parseInline(ln.replace(/^##\s+/, ''), `h${i}`)),
            ]),
          )
        } else if (/^-\s+/.test(ln)) {
          flush()
          blocks.push(
            h('div', { key: `l${i}`, class: 'oto-li' }, [
              h('span', { class: 'oto-li__b' }, '·'),
              h('span', null, parseInline(ln.replace(/^-\s+/, ''), `l${i}`)),
            ]),
          )
        } else if (ln.trim() === '') {
          flush()                       // ligne vide = fin de paragraphe
        } else {
          if (!para.length) paraAt = i   // la clé reste celle de la PREMIÈRE ligne
          para.push(ln.trim())
        }
      })
      flush()
      return h('div', { class: 'oto-content' }, blocks)
    }
  },
})
</script>

<style scoped>
.oto-content {
  font-family: var(--font-sans); font-size: 14px; line-height: 1.75; color: var(--color-ink-soft);
}
.oto-content :deep(strong) { color: var(--color-ink); font-weight: 600; }
.oto-content :deep(.oto-inline-code) {
  font-family: var(--font-mono); font-size: 0.86em; background: var(--color-hair-soft);
  padding: 1px 5px; border-radius: 4px; border: 1px solid var(--color-hair);
}
.oto-h {
  font-size: 13px; font-weight: 700; letter-spacing: -0.005em; color: var(--color-ink);
  text-transform: lowercase; display: flex; align-items: center; gap: 9px;
}
.oto-h__n {
  font-family: var(--font-mono); font-size: 10px; font-weight: 600; color: var(--color-saffron-ink);
  background: var(--color-saffron-soft); border-radius: 999px; padding: 1px 7px; flex: none;
}
.oto-li { display: flex; gap: 9px; margin: 4px 0; padding-left: 2px; }
.oto-li__b { color: var(--color-saffron); flex: none; line-height: 1.75; }
.oto-p { margin: 7px 0; text-wrap: pretty; }
</style>

<script lang="ts">
// Renderer des sections de doc « how-to » d'un connecteur (générique, user-facing).
// Markdown-lite SÛR (rendu via VNodes, pas de v-html) : liens [label](url), **gras**,
// `code`, listes `- `. Badge par `kind` (prerequisite/setup/usage/note).
import { defineComponent, h, type PropType, type VNode } from 'vue'
import type { DocSection } from '@/types/api'

const KIND_META: Record<string, { icon: string; tone: string }> = {
  prerequisite: { icon: '⚠', tone: 'var(--color-saffron)' },
  setup: { icon: '⚙', tone: 'var(--color-cobalt)' },
  usage: { icon: '▸', tone: 'var(--color-olive)' },
  note: { icon: '·', tone: 'var(--color-mute)' },
}

export default defineComponent({
  name: 'DocSections',
  props: {
    sections: { type: Array as PropType<DocSection[]>, default: () => [] },
  },
  setup(props) {
    const inline = (text: string, kp: string): (VNode | string)[] => {
      const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g)
      const out: (VNode | string)[] = []
      parts.forEach((p, i) => {
        if (!p) return
        let m: RegExpMatchArray | null
        if ((m = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/))) {
          out.push(h('a', { key: `${kp}a${i}`, href: m[2], target: '_blank', rel: 'noopener', class: 'ds-link' }, m[1] ?? ''))
        } else if ((m = p.match(/^\*\*([^*]+)\*\*$/))) {
          out.push(h('strong', { key: `${kp}b${i}` }, m[1] ?? ''))
        } else if ((m = p.match(/^`([^`]+)`$/))) {
          out.push(h('code', { key: `${kp}c${i}`, class: 'ds-code' }, m[1] ?? ''))
        } else {
          out.push(p)
        }
      })
      return out
    }

    const body = (md: string, kp: string): VNode[] =>
      md.split('\n').filter((l) => l.trim() !== '').map((ln, i) =>
        /^-\s+/.test(ln)
          ? h('div', { key: `${kp}l${i}`, class: 'ds-li' }, [h('span', { class: 'ds-bullet' }, '·'), h('span', null, inline(ln.replace(/^-\s+/, ''), `${kp}l${i}`))])
          : h('div', { key: `${kp}p${i}`, class: 'ds-p' }, inline(ln, `${kp}p${i}`)))

    return () => h('div', { class: 'ds' }, props.sections.map((s, i) => {
      const meta = KIND_META[s.kind] ?? KIND_META.note
      return h('div', { key: `s${i}`, class: 'ds-sec' }, [
        h('div', { class: 'ds-head' }, [
          h('span', { class: 'ds-icon', style: { color: meta!.tone } }, meta!.icon),
          h('span', { class: 'ds-title' }, s.title),
        ]),
        ...body(s.body_md, `s${i}`),
      ])
    }))
  },
})
</script>

<style scoped>
.ds { display: flex; flex-direction: column; gap: 10px; }
.ds-sec { font-size: 11.5px; line-height: 1.55; color: var(--color-mute); }
.ds-head { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.ds-icon { font-size: 12px; flex: none; }
.ds-title { font-weight: 700; color: var(--color-ink-soft); text-transform: lowercase; }
.ds-p { margin: 1px 0; word-break: break-word; }
.ds-li { display: flex; gap: 7px; margin: 1px 0; padding-left: 4px; }
.ds-bullet { color: var(--color-saffron); flex: none; }
.ds :deep(.ds-link) { color: var(--color-cobalt-ink); text-decoration: underline; word-break: break-all; }
.ds :deep(.ds-code) {
  font-family: var(--font-mono); font-size: 0.86em; background: var(--color-hair-soft);
  padding: 1px 5px; border-radius: 4px; border: 1px solid var(--color-hair); word-break: break-all;
}
</style>

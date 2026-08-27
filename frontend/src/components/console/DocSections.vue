<script lang="ts">
// Renderer des sections de doc « how-to » d'un connecteur (générique, user-facing).
// Markdown-lite SÛR (rendu via VNodes, pas de v-html) : liens [label](url), **gras**,
// `code`, listes `- `. Badge par `kind` (prerequisite/setup/usage/note).
import { defineComponent, h, ref, type PropType, type VNode } from 'vue'
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
          // Anti-XSS : n'autoriser QUE http(s) ; tout autre schéma (javascript:, data:…)
          // → rendu en texte brut, jamais en lien cliquable.
          const url = m[2] ?? ''
          out.push(/^https?:\/\//i.test(url)
            ? h('a', { key: `${kp}a${i}`, href: url, target: '_blank', rel: 'noopener', class: 'ds-link' }, m[1] ?? '')
            : (m[1] ?? ''))
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

    // Un bloc ``` n'est pas de la mise en forme : c'est quelque chose à COPIER —
    // un manifeste d'app à coller chez le fournisseur, un exemple de charge utile.
    // Le rendre ligne à ligne le détruirait (indentation perdue, lignes vides
    // supprimées, `-` d'une liste YAML pris pour une puce). D'où le découpage du
    // corps en blocs AVANT tout traitement inline, et un bouton copier : lire un
    // YAML de vingt lignes pour le retaper à la main serait absurde.
    const copie = ref<string | null>(null)

    const bloc = (code: string, kp: string): VNode =>
      h('div', { key: `${kp}pre`, class: 'ds-block' }, [
        h('button', {
          class: 'ds-copy', type: 'button',
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(code)
              copie.value = kp
              setTimeout(() => { if (copie.value === kp) copie.value = null }, 1600)
            } catch { /* presse-papier refusé : le texte reste sélectionnable */ }
          },
        }, copie.value === kp ? 'copié' : 'copier'),
        h('pre', { class: 'ds-pre' }, h('code', null, code)),
      ])

    const lignes = (md: string, kp: string): VNode[] =>
      md.split('\n').filter((l) => l.trim() !== '').map((ln, i) =>
        /^-\s+/.test(ln)
          ? h('div', { key: `${kp}l${i}`, class: 'ds-li' }, [h('span', { class: 'ds-bullet' }, '·'), h('span', null, inline(ln.replace(/^-\s+/, ''), `${kp}l${i}`))])
          : h('div', { key: `${kp}p${i}`, class: 'ds-p' }, inline(ln, `${kp}p${i}`)))

    const body = (md: string, kp: string): VNode[] => {
      // Découpe sur les clôtures ``` : les segments d'index IMPAIR sont les blocs.
      // Un bloc non refermé (doc mal écrite) reste du texte, il ne mange pas la fin.
      const segs = md.split(/^```[\w-]*\s*$/m)
      if (segs.length < 3) return lignes(md, kp)
      const out: VNode[] = []
      segs.forEach((seg, i) => {
        if (i % 2 === 1) out.push(bloc(seg.replace(/^\n|\n$/g, ''), `${kp}${i}`))
        else if (seg.trim()) out.push(...lignes(seg, `${kp}${i}`))
      })
      return out
    }

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
.ds-block { position: relative; margin: 6px 0; }
.ds-pre {
  margin: 0; padding: 9px 10px; overflow-x: auto;
  background: var(--color-surface); border: 1px solid var(--color-hair);
  border-radius: var(--radius-md); font-family: var(--font-mono);
  font-size: 10.5px; line-height: 1.5; color: var(--color-ink-soft);
}
.ds-copy {
  position: absolute; top: 5px; right: 5px; z-index: 1;
  font: inherit; font-size: 10px; font-weight: 600; cursor: pointer;
  padding: 2px 7px; border-radius: var(--radius-pill);
  border: 1px solid var(--color-hair); background: var(--color-surface);
  color: var(--color-mute);
}
.ds-copy:hover { color: var(--color-ink); border-color: var(--color-hair-classic); }
.ds :deep(.ds-code) {
  font-family: var(--font-mono); font-size: 0.86em; background: var(--color-hair-soft);
  padding: 1px 5px; border-radius: 4px; border: 1px solid var(--color-hair); word-break: break-all;
}
</style>

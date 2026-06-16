<script setup lang="ts">
import { computed } from 'vue'
import { refNames, resolveTool, type ToolReg } from './tools'

const props = defineProps<{ text: string; reg: ToolReg }>()

const items = computed(() =>
  refNames(props.text).map((name) => {
    const r = resolveTool(props.reg, name)
    if (r.state === 'dead') {
      return {
        name, desc: 'introuvable dans le registre — renommé ou supprimé ?',
        descColor: 'var(--color-terra-ink)', nameColor: 'var(--color-terra-ink)',
        dot: 'var(--color-terra)', stateLabel: 'introuvable', state: 'dead' as const,
      }
    }
    if (r.state === 'fed') {
      return {
        name, desc: r.desc, descColor: 'var(--color-mute)', nameColor: 'var(--color-ink)',
        dot: 'var(--color-cobalt)', stateLabel: `fédéré · ${r.mcp ?? ''}`, state: 'fed' as const,
      }
    }
    return {
      name, desc: r.desc, descColor: 'var(--color-mute)', nameColor: 'var(--color-ink)',
      dot: 'var(--color-olive)', stateLabel: 'natif oto', state: 'ok' as const,
    }
  }),
)
const refCount = computed(() => {
  const n = items.value.length
  return `${n} ${n > 1 ? 'outils' : 'outil'}`
})
</script>

<template>
  <div class="card">
    <div class="head">
      <span class="eyebrow">outils référencés</span>
      <span class="count">{{ refCount }}</span>
    </div>
    <div class="sub">
      dérivé du content, en lecture seule — résolu en direct contre le registre. la
      description vient de l'outil lui-même.
    </div>

    <div v-if="items.length" class="list">
      <div v-for="t in items" :key="t.name" class="row">
        <span class="dot" :style="{ background: t.dot }" />
        <div class="body">
          <div class="line">
            <code class="name" :style="{ color: t.nameColor }">{{ t.name }}</code>
            <svg v-if="t.state === 'dead'" width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="var(--color-terra)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3 2 20h20L12 3z" /><path d="M12 10v5M12 18h.01" />
            </svg>
          </div>
          <div class="desc" :style="{ color: t.descColor }">{{ t.desc }}</div>
        </div>
        <span class="pill" :class="`pill--${t.state}`">{{ t.stateLabel }}</span>
      </div>
    </div>
    <div v-else class="empty">aucun outil cité — utilisez <code>&lt;tool:nom&gt;</code> dans le content.</div>
  </div>
</template>

<style scoped>
.card { background: var(--color-surface); border: 1px solid var(--color-hair); border-radius: 14px; padding: 18px 20px; }
.head { display: flex; align-items: baseline; gap: 10px; }
.eyebrow { font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--color-mute); }
.count { font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); }
.sub { font-size: 12px; color: var(--color-mute); margin-top: 4px; line-height: 1.5; }
.list { margin-top: 13px; display: flex; flex-direction: column; }
.row { display: flex; align-items: flex-start; gap: 11px; padding: 10px 0; border-top: 1px solid var(--color-hair-soft); }
.dot { margin-top: 5px; width: 7px; height: 7px; border-radius: 999px; flex: none; }
.body { flex: 1; min-width: 0; }
.line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.name { font-family: var(--font-mono); font-size: 12.5px; font-weight: 500; background: none; border: 0; padding: 0; }
.desc { font-size: 11.5px; margin-top: 2px; line-height: 1.45; }
.pill {
  font-family: var(--font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.1em;
  text-transform: uppercase; padding: 3px 8px; border-radius: 999px; white-space: nowrap; flex: none;
}
.pill--ok { background: var(--color-olive-soft); color: var(--color-olive-ink); }
.pill--fed { background: var(--color-cobalt-soft); color: var(--color-cobalt-ink); }
.pill--dead { background: var(--color-terra-soft); color: var(--color-terra-ink); }
.empty { margin-top: 12px; font-size: 12px; color: var(--color-faint); }
.empty code { font-family: var(--font-mono); font-size: 11px; }
</style>

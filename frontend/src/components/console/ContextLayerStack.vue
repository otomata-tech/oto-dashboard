<script setup lang="ts">
// Pile « anatomie de l'artefact injecté » — le hero de /context. Chaque couche du
// contexte reçu par l'agent au handshake (backend `session_layers`, derive don't
// duplicate) est une rangée : barre proportionnelle à son poids (caractères), label,
// nature, et expansion au clic (contenu + action d'édition selon la couche).
// La couche `user` (ta note) rend le slot #user-editor (AgentReadmeCard) — présent
// même quand la couche est vide (rangée fantôme : c'est là qu'on CRÉE sa note).
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Icon from './Icon.vue'
import Tag from './Tag.vue'
import Btn from './Btn.vue'
import type { ContextLayer } from '@/types/api'

const props = defineProps<{
  layers: ContextLayer[]
  /** une équipe est active → la rangée équipe (même vide) a du sens */
  hasGroup?: boolean
}>()

const open = ref<Set<string>>(new Set())
function toggle(key: string) {
  const s = new Set(open.value)
  s.has(key) ? s.delete(key) : s.add(key)
  open.value = s
}

// Nature de chaque couche : qui l'écrit / comment elle vit. Pilote badge + action.
const META: Record<string, { tone?: 'olive' | 'saffron' | 'cobalt'; nature: string; edit?: string }> = {
  platform: { nature: 'socle plateforme', tone: 'cobalt' },
  catalog: { nature: 'dérivé · catalogue des connecteurs', tone: 'cobalt' },
  context: { nature: 'dérivé · résolu à chaque session', tone: 'cobalt' },
  profile: { nature: 'entretenue par ton agent' },
  org: { nature: 'écrite par un admin de ton org', tone: 'olive', edit: '/org/context' },
  group: { nature: 'écrite par ton chef d’équipe', tone: 'saffron', edit: '/team/context' },
  user: { nature: 'ta prose, injectée après le reste' },
}

const total = computed(() => props.layers.reduce((n, l) => n + l.chars, 0))
const maxChars = computed(() => Math.max(...props.layers.map((l) => l.chars), 1))

// Rangées affichées = couches reçues ∪ fantômes éditables absentes (user toujours ;
// org toujours — c'est l'affordance de création ; group si une équipe est active).
interface Row extends ContextLayer { ghost?: boolean }
const rows = computed<Row[]>(() => {
  const out: Row[] = [...props.layers]
  const has = (k: string) => out.some((l) => l.key === k)
  const ghost = (key: Row['key'], label: string) =>
    out.push({ key, label, body: '', chars: 0, ghost: true })
  if (!has('org')) ghost('org', 'readme de ton org')
  if (props.hasGroup && !has('group')) ghost('group', 'readme de ton équipe')
  if (!has('user')) ghost('user', 'ta note')
  return out
})

const fmt = (n: number) => n.toLocaleString('fr-FR')
const pct = (l: Row) => Math.max(1.5, (l.chars / maxChars.value) * 100)
</script>

<template>
  <div class="stack">
    <div class="stack-head">
      <span class="stack-total"><strong>{{ fmt(total) }}</strong> caractères injectés à chaque conversation</span>
    </div>
    <div v-for="l in rows" :key="l.key" class="layer" :class="{ open: open.has(l.key), ghost: l.ghost }">
      <button class="layer-row" @click="toggle(l.key)">
        <Icon name="chevd" :size="12" class="layer-chev" :class="{ open: open.has(l.key) }" />
        <span class="layer-label">{{ l.label }}</span>
        <span class="layer-track">
          <span class="layer-bar" :class="`bar-${META[l.key]?.tone ?? 'ink'}`"
            :style="{ width: l.ghost ? '0' : pct(l) + '%' }" />
        </span>
        <span class="layer-chars">{{ l.ghost ? 'vide' : fmt(l.chars) + ' c.' }}</span>
        <Icon v-if="META[l.key]?.edit || l.key === 'user'" name="pencil" :size="12" class="layer-pen" />
      </button>
      <div v-if="open.has(l.key)" class="layer-body">
        <div class="layer-meta">
          <Tag :tone="META[l.key]?.tone">{{ META[l.key]?.nature }}</Tag>
          <RouterLink v-if="META[l.key]?.edit" :to="META[l.key]!.edit!">
            <Btn kind="mini">{{ l.ghost ? 'Écrire côté org →' : 'Voir / éditer →' }}</Btn>
          </RouterLink>
        </div>
        <!-- ta note : l'éditeur in-situ remplace le dump (c'est la prose stockée) -->
        <slot v-if="l.key === 'user'" name="user-editor" />
        <p v-else-if="l.key === 'profile'" class="helptext" style="margin-bottom: 8px">
          ton agent remplit cette fiche au fil des conversations (<code>oto_profile</code>) — corrige-le en lui parlant.
        </p>
        <pre v-if="l.key !== 'user' && !l.ghost" class="layer-pre">{{ l.body }}</pre>
        <p v-else-if="l.key !== 'user'" class="helptext">rien pour l'instant — cette couche n'est pas injectée.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stack {
  background: var(--color-surface);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: 6px 16px 10px;
}
.stack-head { padding: 10px 2px 8px; border-bottom: 1px solid var(--color-hair-soft); }
.stack-total { font-size: 13px; color: var(--color-mute); }
.stack-total strong { color: var(--color-ink); font-size: 15px; }

.layer { border-top: 1px solid var(--color-hair-soft); }
.layer:first-of-type { border-top: 0; }

.layer-row {
  display: flex; align-items: center; gap: 10px; width: 100%;
  background: none; border: 0; cursor: pointer; font: inherit;
  padding: 9px 2px; text-align: left;
}
.layer-row:hover { background: var(--color-paper-2); }
.layer-chev { color: var(--color-faint); transition: transform var(--t-fast); flex: none; }
.layer-chev.open { transform: rotate(180deg); }
.layer-label { font-size: 13.5px; font-weight: 600; color: var(--color-ink); flex: none; min-width: 11rem; }
.ghost .layer-label { color: var(--color-mute); font-weight: 500; }

.layer-track { flex: 1; height: 10px; border-radius: var(--radius-pill); background: var(--color-paper-2); overflow: hidden; }
.layer-bar { display: block; height: 100%; border-radius: var(--radius-pill); transition: width var(--t-med) var(--ease-out); }
.bar-ink { background: var(--color-ink-soft); }
.bar-cobalt { background: var(--color-cobalt); }
.bar-olive { background: var(--color-olive); }
.bar-saffron { background: var(--color-saffron); }

.layer-chars { font-family: var(--font-mono); font-size: 11.5px; color: var(--color-faint); flex: none; min-width: 4.5rem; text-align: right; }
.layer-pen { color: var(--color-faint); flex: none; }

.layer-body { padding: 2px 2px 12px 22px; }
.layer-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.layer-pre {
  white-space: pre-wrap; word-break: break-word;
  font-size: 12px; line-height: 1.5; max-height: 320px; overflow: auto;
  background: var(--color-paper-2);
  border: 1px solid var(--color-hair-soft);
  border-radius: var(--radius-md); padding: 10px 12px; color: var(--color-ink-soft);
}

@media (max-width: 640px) {
  .layer-label { min-width: 0; flex: 1; }
  .layer-track { display: none; }
}
</style>

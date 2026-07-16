<script setup lang="ts">
// Drawer HISTORIQUE d'un projet (refonte UX, ADR 0032) — panneau droit ~50 %. Enveloppe
// ActivityChart (graphe 14 j) + une liste d'événements ENRICHIS (pastille sémantique
// agent/humain/audit + auteur). L'auteur (`par …`) n'est pas encore porté par le DTO
// ProjectActivity → dérivé par heuristique de `action` (déroulé/enrichi/collecte → agent ;
// partagé/publié/édité → humain ; audit → auto).
import { computed, defineAsyncComponent } from 'vue'
import Icon from '@/components/console/Icon.vue'
import { fmtDate } from '@/types/api'
import type { ProjectActivity } from '@/types/api'
const ActivityChart = defineAsyncComponent(() => import('@/components/console/ActivityChart.vue'))

const props = withDefaults(defineProps<{ open: boolean; activity: ProjectActivity[]; days?: number }>(), { days: 14 })
const emit = defineEmits<{ close: [] }>()

type Kind = 'agent' | 'human' | 'audit'
function kindOf(a: ProjectActivity): Kind {
  const s = (a.action || '').toLowerCase()
  if (s.includes('audit') || s.includes('vérifier')) return 'audit'
  if (/(déroul|enrichi|collect|rafraîch|généré|préparé|annuaire|run)/.test(s)) return 'agent'
  return 'human'
}
const DOT: Record<Kind, string> = { agent: 'var(--color-olive)', human: 'var(--color-cobalt)', audit: 'var(--color-saffron)' }
const WHO: Record<Kind, string> = { agent: "l'agent", human: 'un membre', audit: 'Oto (auto)' }
// « par X » : l'auteur RÉEL (actor résolu backend) prime ; sinon on retombe sur le libellé
// dérivé du type d'événement (heuristique) — best-effort, jamais vide.
function whoOf(a: ProjectActivity, kind: Kind): string {
  return a.actor?.name || a.actor?.email || WHO[kind]
}
const rows = computed(() => props.activity.map((a) => {
  const kind = kindOf(a)
  return { ...a, kind, who: whoOf(a, kind) }
}))
</script>

<template>
  <Transition name="drawer-fade">
    <div v-if="open" class="dr-ov" @mousedown.self="emit('close')">
      <div class="dr" role="dialog" aria-modal="true" aria-label="historique">
        <header class="dr__hd">
          <span class="dr__hdic"><Icon name="activity" :size="17" /></span>
          <strong class="dr__hdl">Historique</strong>
          <button class="dr__close" aria-label="fermer" @click="emit('close')"><Icon name="x" :size="16" /></button>
        </header>
        <div class="dr__body">
          <div class="dr__secrow">
            <span class="dr__sec">Activité · {{ days }} jours</span>
            <span class="dr__count">{{ activity.length }} événements</span>
          </div>
          <ActivityChart v-if="activity.length" :activity="activity" :days="days" />
          <p v-else class="dim" style="font-size: 12.5px; margin: 8px 0 0">aucune activité.</p>

          <div class="dr__sec" style="margin: 20px 0 6px">Événements</div>
          <div class="dr__events">
            <div v-for="(a, i) in rows" :key="i" class="dr__ev">
              <span class="dr__dot" :style="{ background: DOT[a.kind] }"></span>
              <span class="dr__evtxt">
                <span class="dr__evline"><strong>{{ a.action }}</strong><span v-if="a.detail" class="dim"> · {{ a.detail }}</span></span>
                <span class="dr__evwho">par {{ a.who }}</span>
              </span>
              <span class="dr__evt">{{ fmtDate(a.created_at) }}</span>
            </div>
            <p v-if="!rows.length" class="dim" style="font-size: 12.5px">aucun événement.</p>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.dr-ov { position: fixed; inset: 0; z-index: var(--z-modal); background: color-mix(in srgb, var(--color-ink) 35%, transparent); }
.dr { position: absolute; top: 0; right: 0; bottom: 0; width: 50%; min-width: 420px; max-width: 760px; background: var(--color-surface); border-left: 1px solid var(--border-card); box-shadow: var(--shadow-drawer); display: flex; flex-direction: column; }
.dr__hd { display: flex; align-items: center; gap: 9px; padding: 10px 16px; border-bottom: 1px solid var(--color-hair); flex: none; background: var(--color-saffron-soft); }
.dr__hdic { display: inline-flex; color: var(--color-saffron-ink); }
.dr__hdl { font-size: 14px; font-weight: 700; color: var(--color-saffron-ink); }
.dr__close { margin-left: auto; height: 30px; width: 30px; display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; border-radius: var(--radius-pill); color: var(--color-mute); cursor: pointer; }
.dr__close:hover { background: var(--color-paper-2); color: var(--color-ink); }
.dr__body { flex: 1; overflow-y: auto; padding: 18px 20px; }
.dr__secrow { display: flex; align-items: baseline; gap: 8px; }
.dr__sec { font-size: 14.5px; font-weight: 700; letter-spacing: -.01em; color: var(--color-saffron-ink); }
.dr__count { margin-left: auto; font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); }
.dr__events { display: flex; flex-direction: column; }
.dr__ev { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--color-hair-soft); }
.dr__dot { width: 8px; height: 8px; border-radius: var(--radius-pill); flex: none; margin-top: 5px; }
.dr__evtxt { flex: 1; min-width: 0; }
.dr__evline { display: block; font-size: 13px; line-height: 1.45; color: var(--color-ink-soft); }
.dr__evline strong { font-weight: 600; color: var(--color-ink); }
.dr__evwho { display: block; font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); margin-top: 3px; }
.dr__evt { font-family: var(--font-mono); font-size: 10px; color: var(--color-faint); flex: none; padding-top: 3px; }
.drawer-fade-enter-active, .drawer-fade-leave-active { transition: opacity .16s ease; }
.drawer-fade-enter-from, .drawer-fade-leave-to { opacity: 0; }
</style>

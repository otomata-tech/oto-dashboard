<script setup lang="ts">
// Surveillance d'une flotte en marche — ce qu'on regarde pendant qu'elle tourne,
// et que la file d'exécution seule ne montrait pas.
//
// La file répond à « où en est CE travail ». Elle ne répond pas à « est-ce que la
// campagne va bien », qui est la question qu'on se pose réellement devant cent
// lignes : combien de lignes sont écrites, est-ce que des travaux repartent en
// boucle, combien ça coûte, y a-t-il un agent bloqué — et surtout : est-ce qu'une
// garde a dû rattraper quelque chose.
//
// L'ORDRE DE CETTE CARTE EST SON PROPOS. Les gardes sont en tête, seules et en
// couleur, avant toute mesure. Ce n'est pas de l'emphase décorative : un travail
// dont la garde a réparé les données se conclut « terminé », sans erreur, et se
// range visuellement avec les succès. Rangé sous les jetons et les durées, ce
// signal-là se lit une fois sur dix ; en tête, il se lit toujours.
import { computed, ref } from 'vue'
import ConsoleCard from './ConsoleCard.vue'
import Btn from './Btn.vue'
import MonitoringStats from './monitoring/MonitoringStats.vue'
import RunnerJobDetail from './RunnerJobDetail.vue'
import { useRunnerJobs, FENETRE } from '@/composables/useRunnerJobs'
import type { RunnerJob } from '@/api/console'
import {
  GARDES, aUneGarde, compteGarde, duree, jetons, procOf, flotteOf,
  renvoiMuet, renvois, sejour, sejourMs, totalGardes,
} from '@/lib/runnerJobs'

const { jobs, loaded, error, maintenant, charger } = useRunnerJobs({ veille: true })

function somme(f: (j: RunnerJob) => number): number {
  return jobs.value.reduce((s, j) => s + f(j), 0)
}
function nombre(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

// ── Les gardes, d'abord ─────────────────────────────────────────────────────
const gardes = computed(() => {
  const postes = GARDES
    .map((g) => ({ ...g, n: somme((j) => compteGarde(j, g.cle)) }))
    .filter((p) => p.n > 0)
  const touches = jobs.value.filter(aUneGarde)
  return { postes, touches, actif: postes.length > 0 }
})

// ── Mesures de la fenêtre ───────────────────────────────────────────────────
const m = computed(() => {
  const js = jobs.value
  const conclus = js.filter((j) => j.status === 'done')
  const durees = conclus
    .map((j) => sejourMs(j, maintenant.value))
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b)
  return {
    total: js.length,
    conclus: conclus.length,
    enCours: js.filter((j) => j.status === 'claimed').length,
    attente: js.filter((j) => j.status === 'pending').length,
    echecs: js.filter((j) => j.status === 'failed').length,
    reserves: somme((j) => nombre(j.result?.claims)),
    ecrites: somme((j) => nombre(j.result?.writes)),
    jetonsTot: somme((j) => nombre(j.result?.usage_tokens)),
    cache: somme((j) => nombre(j.result?.usage_cache_read)),
    mediane: durees[Math.floor(durees.length / 2)] ?? null,
    // Réservé, conclu, rien écrit : le tour perdu ne lève aucune erreur.
    perdus: conclus.filter((j) => j.result?.faux_depart === true
      || j.result?.claim_vide === true).length,
    renvoisTot: somme(renvois),
    renvoyes: js.filter((j) => renvois(j) > 0).length,
    muets: js.filter(renvoiMuet).length,
  }
})

const mesures = computed(() => {
  const v = m.value
  return [
    {
      label: 'écritures',
      value: v.ecrites,
      // Le dénominateur VRAI est ce que les agents ont réservé, pas le nombre de
      // travaux : un travail peut réserver plusieurs lignes, ou aucune. Le volume
      // visé par la campagne, lui, vit dans la déclaration de flotte — que l'API
      // ne rend pas. Mieux vaut un rapport exact et partiel qu'un total supposé.
      sub: v.reserves
        ? `sur ${v.reserves} ligne${v.reserves > 1 ? 's' : ''} réservée${v.reserves > 1 ? 's' : ''}`
        : `sur ${v.conclus} travaux conclus`,
    },
    {
      label: 'en cours',
      value: v.enCours,
      sub: v.attente ? `${v.attente} en attente` : 'file vidée',
    },
    {
      label: 'jetons facturés',
      value: jetons(v.jetonsTot) ?? '0',
      sub: v.cache ? `${jetons(v.cache)} lus en cache` : 'sans cache',
    },
    {
      label: 'séjour médian',
      value: v.mediane !== null ? duree(v.mediane) : '—',
      sub: v.conclus ? `${v.conclus} travaux conclus` : 'rien de conclu',
      tone: undefined,
    },
  ]
})

// Composition de la fenêtre, en une barre : le coup d'œil « où en est la file ».
const parts = computed(() => {
  const v = m.value
  const t = v.total || 1
  return [
    { cle: 'done', label: 'conclus', n: v.conclus, pc: (100 * v.conclus) / t },
    { cle: 'failed', label: 'en échec', n: v.echecs, pc: (100 * v.echecs) / t },
    { cle: 'claimed', label: 'en cours', n: v.enCours, pc: (100 * v.enCours) / t },
    { cle: 'pending', label: 'en attente', n: v.attente, pc: (100 * v.attente) / t },
  ].filter((p) => p.n > 0)
})

// ── Agents bloqués ──────────────────────────────────────────────────────────
// Le seuil est DÉRIVÉ de la campagne elle-même (3 × le séjour médian observé),
// jamais d'une constante : une flotte dont chaque tour dure 20 s et une autre dont
// il dure 8 min n'ont pas le même « trop long ». Sans médiane (rien de conclu), on
// se garde d'accuser : la liste s'affiche, sans verdict.
const seuilBloque = computed(() => {
  const v = m.value
  return v.conclus >= 2 && v.mediane ? v.mediane * 3 : null
})
const enCoursLongs = computed(() =>
  jobs.value
    .filter((j) => j.status === 'claimed')
    .map((j) => ({ j, ms: sejourMs(j, maintenant.value) ?? 0 }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 5))
function bloque(ms: number): boolean {
  return seuilBloque.value !== null && ms > seuilBloque.value
}

const ouvert = ref<RunnerJob | null>(null)
</script>

<template>
  <ConsoleCard
    title="Surveillance"
    :sub="`L'état de la flotte pendant qu'elle tourne — sur les ${FENETRE} derniers travaux.`"
  >
    <template #actions>
      <Btn kind="mini" @click="charger">Rafraîchir</Btn>
    </template>

    <div class="card-body">
      <p v-if="error" class="rm-err">{{ error }}</p>

      <p v-else-if="loaded && !m.total" class="rm-vide">
        Aucun travail dans la fenêtre — rien à surveiller pour l'instant.
      </p>

      <template v-else-if="loaded">
        <!-- ① Les gardes. Seul bloc coloré de la carte, et le premier lu. -->
        <div v-if="gardes.actif" class="rm-garde">
          <div class="rm-garde-t">Une garde est intervenue sur les données</div>
          <p class="rm-garde-s">
            Ces travaux se sont conclus sans erreur : la garde a rattrapé ce qu'ils
            avaient écrit. À vérifier avant de se fier au tableau.
          </p>
          <ul class="rm-garde-l">
            <li v-for="p in gardes.postes" :key="p.cle" :class="{ severe: p.severe }">
              <b>{{ p.n }}</b> {{ p.label }}
            </li>
          </ul>
          <div class="rm-garde-j">
            <button
              v-for="j in gardes.touches" :key="j.id" type="button"
              class="rm-jchip" @click="ouvert = j"
            >#{{ j.id }} <span>{{ totalGardes(j) }}</span></button>
          </div>
        </div>

        <!-- ② Les mesures -->
        <MonitoringStats :items="mesures" />

        <!-- ③ La composition de la fenêtre -->
        <div v-if="parts.length > 1" class="rm-barre" :title="parts.map((p) => `${p.n} ${p.label}`).join(' · ')">
          <span v-for="p in parts" :key="p.cle" :class="['rm-seg', p.cle]" :style="{ width: p.pc + '%' }" />
        </div>
        <p v-if="parts.length" class="rm-leg">
          <span v-for="p in parts" :key="p.cle" class="rm-legi">
            <i :class="['rm-pt', p.cle]" />{{ p.n }} {{ p.label }}
          </span>
        </p>

        <!-- ④ Ce qui repart en boucle, ce qui n'a rien produit -->
        <p v-if="m.renvoisTot || m.perdus" class="rm-renvoi">
          <span v-if="m.renvoisTot">
            <b>{{ m.renvoisTot }}</b> renvoi{{ m.renvoisTot > 1 ? 's' : '' }} du harnais
            sur {{ m.renvoyes }} travail{{ m.renvoyes > 1 ? 'x' : '' }}
            <!-- Repris sans motif d'échec : le worker est mort en cours de bail.
                 Ça ne se soigne pas comme un échec déclaré, d'où la distinction. -->
            <span v-if="m.muets" class="rm-mute">
              — dont {{ m.muets }} sans motif (worker perdu en cours de route)</span>
          </span>
          <span v-if="m.renvoisTot && m.perdus"> · </span>
          <span v-if="m.perdus">
            <b>{{ m.perdus }}</b> réservation{{ m.perdus > 1 ? 's' : '' }} sans écriture
          </span>
        </p>

        <!-- ⑤ Les agents qui traînent -->
        <div v-if="enCoursLongs.length" class="rm-bloc">
          <div class="rm-bloc-t">
            En cours depuis le plus longtemps
            <span v-if="seuilBloque" class="rm-bloc-s">
              — au-delà de {{ duree(seuilBloque) }}, c'est trois fois le séjour médian
            </span>
          </div>
          <ul class="rm-bloc-l">
            <li v-for="e in enCoursLongs" :key="e.j.id">
              <button type="button" class="rm-bl-id" @click="ouvert = e.j">#{{ e.j.id }}</button>
              <span class="rm-bl-d" :class="{ alerte: bloque(e.ms) }">{{ sejour(e.j, maintenant) }}</span>
              <span class="rm-bl-p">{{ procOf(e.j) }}</span>
              <span v-if="flotteOf(e.j)" class="rm-bl-f">{{ flotteOf(e.j) }}</span>
            </li>
          </ul>
        </div>
      </template>
    </div>
  </ConsoleCard>

  <RunnerJobDetail :job="ouvert" @close="ouvert = null" />
</template>

<style scoped>
.rm-err { margin: 0; font-size: 12.5px; color: var(--color-terra-ink); }
.rm-vide { margin: 0; font-size: 13px; line-height: 1.6; color: var(--color-mute); }

/* ── Les gardes : le seul bloc coloré, en tête ── */
.rm-garde {
  border: 1px solid var(--color-terra-soft);
  background: color-mix(in srgb, var(--color-terra-soft) 34%, transparent);
  border-radius: var(--radius-md);
  padding: 11px 13px;
  margin-bottom: 16px;
}
.rm-garde-t { font-weight: 700; font-size: 13px; color: var(--color-terra-ink); }
.rm-garde-s { margin: 3px 0 8px; font-size: 12px; line-height: 1.5; color: var(--color-ink); }
.rm-garde-l { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.rm-garde-l li {
  font-size: 12px; padding: 2px 9px; border-radius: var(--radius-pill);
  background: var(--color-surface); border: 1px solid var(--color-terra-soft);
  color: var(--color-ink);
}
.rm-garde-l li.severe { border-color: var(--color-terra-ink); color: var(--color-terra-ink); font-weight: 600; }
.rm-garde-l b { font-family: var(--font-mono, monospace); }
.rm-garde-j { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }
.rm-jchip {
  font: inherit; font-family: var(--font-mono, monospace); font-size: 11px; cursor: pointer;
  border: 1px solid var(--color-terra-soft); border-radius: var(--radius-pill);
  background: var(--color-surface); color: var(--color-terra-ink); padding: 1px 8px;
}
.rm-jchip:hover { background: var(--color-terra-soft); }
.rm-jchip span { opacity: .65; }

/* ── Composition de la fenêtre ── */
.rm-barre {
  display: flex; width: 100%; height: 6px; margin: 16px 0 7px;
  border-radius: var(--radius-pill); overflow: hidden; background: var(--color-hair);
}
.rm-seg { display: block; height: 100%; }
.rm-seg.done { background: var(--color-olive); }
.rm-seg.failed { background: var(--color-terra); }
.rm-seg.claimed { background: var(--color-cobalt); }
.rm-seg.pending { background: var(--color-saffron); }
.rm-leg { margin: 0; display: flex; flex-wrap: wrap; gap: 12px; font-size: 11.5px; color: var(--color-mute); }
.rm-legi { display: inline-flex; align-items: center; gap: 5px; }
.rm-pt { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.rm-pt.done { background: var(--color-olive); }
.rm-pt.failed { background: var(--color-terra); }
.rm-pt.claimed { background: var(--color-cobalt); }
.rm-pt.pending { background: var(--color-saffron); }

.rm-renvoi { margin: 12px 0 0; font-size: 12px; color: var(--color-mute); }
.rm-renvoi b { font-family: var(--font-mono, monospace); color: var(--color-ink); }
.rm-mute { color: var(--color-terra-ink); }

/* ── Agents qui traînent ── */
.rm-bloc { margin-top: 16px; border-top: 1px solid var(--color-hair); padding-top: 11px; }
.rm-bloc-t { font-size: 12px; font-weight: 600; color: var(--color-ink); margin-bottom: 7px; }
.rm-bloc-s { font-weight: 400; color: var(--color-faint); }
.rm-bloc-l { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.rm-bloc-l li { display: flex; align-items: baseline; gap: 9px; font-size: 12px; }
.rm-bl-id {
  font: inherit; font-family: var(--font-mono, monospace); font-size: 11px;
  border: 0; background: none; padding: 0; cursor: pointer; color: var(--color-saffron-ink);
  font-weight: 600;
}
.rm-bl-id:hover { color: var(--color-ink); }
.rm-bl-d { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--color-cobalt-ink); }
.rm-bl-d.alerte { color: var(--color-terra-ink); font-weight: 600; }
.rm-bl-p { color: var(--color-mute); }
.rm-bl-f { color: var(--color-faint); margin-left: auto; }
</style>

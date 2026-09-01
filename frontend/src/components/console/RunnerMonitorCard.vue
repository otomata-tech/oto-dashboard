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
import RunnerGardes from './RunnerGardes.vue'
import { useRunnerJobs, FENETRE } from '@/composables/useRunnerJobs'
import type { RunnerJob } from '@/api/console'
import {
  angleMort, aUneGarde, bail, bailExpire, bilanGardes, duree, jetons, procOf, flotteOf,
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
// Au grain flotte on montre des COMPTES (les noms, eux, sont dans la fiche de
// chaque travail) — mais jamais un compte seul : « 0 détruite sur 40 travaux » et
// « 0 détruite sur 12 travaux, 28 non mesurés » ne s'entendent pas pareil, et
// c'est tout l'objet du second bloc.
const gardes = computed(() => {
  const bilan = bilanGardes(jobs.value)
  return {
    garnies: bilan.filter((b) => b.n > 0).map((b) => ({ ...b, texte: String(b.n) })),
    // ⚠️ Ce que PERSONNE N'A REGARDÉ. Sans ce bloc, un travail non vérifié se range
    // à l'écran avec les travaux vérifiés propres — le silence qu'on corrige.
    aveugles: bilan
      .filter((b) => b.nonMesure > 0 || b.illisible > 0)
      .map((b) => ({
        ...b,
        texte: b.illisible
          ? `${b.nonMesure + b.illisible} (dont ${b.illisible} illisible${b.illisible > 1 ? 's' : ''})`
          : String(b.nonMesure),
      })),
    // Vérifié pour de bon : mesuré au moins une fois, jamais garni, jamais aveugle.
    verifiees: bilan.filter((b) => b.mesures > 0 && b.n === 0 && !b.nonMesure && !b.illisible),
    touches: jobs.value.filter(aUneGarde),
    aveuglesJobs: jobs.value.filter(angleMort),
  }
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
// Depuis oto-backend #723, le harnais sert le BAIL RÉEL de chaque prise
// (`lease_until`). Un bail dépassé sur un travail en cours est un FAIT : le worker
// est parti, le job est re-claimable. C'est ce qui remplace la présomption.
//
// ⚠️ Le seuil dérivé (3 × le séjour médian) RESTE, en repli, là où la date manque
// — il a servi et il est juste. Mais il ne s'applique JAMAIS à un travail qui a un
// bail : sur celui-là le fait a déjà tranché, et un « il traîne » de présomption
// contredirait un « son bail court » de mesure, sur la même ligne.
const seuilBloque = computed(() => {
  const v = m.value
  return v.conclus >= 2 && v.mediane ? v.mediane * 3 : null
})

/** `bail` = mesuré ; `seuil` = présumé, faute de date ; `null` = rien à dire. */
type Verdict = 'bail' | 'seuil' | null

const enCoursLongs = computed(() =>
  jobs.value
    .filter((j) => j.status === 'claimed')
    .map((j) => {
      const ms = sejourMs(j, maintenant.value) ?? 0
      const b = bail(j, maintenant.value)
      const verdict: Verdict = bailExpire(j, maintenant.value)
        ? 'bail'
        : b.etat === 'aucun' && seuilBloque.value !== null && ms > seuilBloque.value
          ? 'seuil'
          : null
      return { j, ms, verdict, reste: b.resteMs }
    })
    // Le bail dépassé passe devant : c'est le seul qui appelle un geste.
    .sort((a, b) => (b.verdict === 'bail' ? 1 : 0) - (a.verdict === 'bail' ? 1 : 0) || b.ms - a.ms)
    .slice(0, 5))

/** Combien de travaux en cours portent une vraie date de bail : ce qui dit si le
 * seuil dérivé sert encore de repli, ou s'il n'a plus lieu d'être annoncé. */
const avecBail = computed(() =>
  jobs.value.filter((j) => j.status === 'claimed' && bail(j, maintenant.value).etat !== 'aucun').length)
const expires = computed(() =>
  jobs.value.filter((j) => bailExpire(j, maintenant.value)).length)

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
        <!-- ① Les gardes. Seuls blocs colorés de la carte, et les premiers lus. -->
        <RunnerGardes
          class="rm-gardes"
          titre="Une garde est intervenue sur les données"
          sous="Ces travaux se sont conclus sans erreur : la garde a rattrapé ce qu'ils
                avaient écrit. À vérifier avant de se fier au tableau."
          :garnies="gardes.garnies" :aveugles="gardes.aveugles" :verifiees="gardes.verifiees"
        >
          <template #jetons>
            <div class="rm-garde-j">
              <button
                v-for="j in gardes.touches" :key="j.id" type="button"
                class="rm-jchip" @click="ouvert = j"
              >#{{ j.id }} <span>{{ totalGardes(j) }}</span></button>
            </div>
          </template>
          <template #aveugles>
            <div class="rm-garde-j">
              <button
                v-for="j in gardes.aveuglesJobs" :key="j.id" type="button"
                class="rm-jchip aveugle" @click="ouvert = j"
              >#{{ j.id }}</button>
            </div>
          </template>
        </RunnerGardes>

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
            <!-- Ce qui est MESURÉ se dit d'abord ; le seuil dérivé n'est annoncé
                 que s'il sert encore, c'est-à-dire s'il reste des prises sans bail. -->
            <span v-if="expires" class="rm-bloc-a">
              — {{ expires }} bail{{ expires > 1 ? 'x' : '' }} dépassé{{ expires > 1 ? 's' : '' }}
            </span>
            <span v-if="seuilBloque && avecBail < m.enCours" class="rm-bloc-s">
              — sans bail servi, on présume au-delà de {{ duree(seuilBloque) }}
              (trois fois le séjour médian)
            </span>
          </div>
          <ul class="rm-bloc-l">
            <li v-for="e in enCoursLongs" :key="e.j.id">
              <button type="button" class="rm-bl-id" @click="ouvert = e.j">#{{ e.j.id }}</button>
              <span class="rm-bl-d" :class="{ alerte: e.verdict === 'bail', presume: e.verdict === 'seuil' }">
                {{ sejour(e.j, maintenant) }}
              </span>
              <!-- Le mot dit d'où vient le verdict : « bail dépassé » est un fait
                   servi, « traîne » reste une présomption tirée de la campagne. -->
              <span v-if="e.verdict === 'bail'" class="rm-bl-v alerte">bail dépassé</span>
              <span v-else-if="e.verdict === 'seuil'" class="rm-bl-v">traîne</span>
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

/* ── Les gardes, en tête ── */
.rm-gardes { margin-bottom: 16px; }
.rm-garde-j { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }
.rm-jchip {
  font: inherit; font-family: var(--font-mono, monospace); font-size: 11px; cursor: pointer;
  border: 1px solid var(--color-terra-soft); border-radius: var(--radius-pill);
  background: var(--color-surface); color: var(--color-terra-ink); padding: 1px 8px;
}
.rm-jchip:hover { background: var(--color-terra-soft); }
.rm-jchip span { opacity: .65; }
/* L'angle mort a son propre ton : ni succès, ni échec. */
.rm-jchip.aveugle { border-color: var(--color-saffron-soft); color: var(--color-saffron-ink); }
.rm-jchip.aveugle:hover { background: var(--color-saffron-soft); }

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
.rm-bloc-a { font-weight: 600; color: var(--color-terra-ink); }
.rm-bl-v {
  font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em;
  color: var(--color-faint);
}
.rm-bl-v.alerte { color: var(--color-terra-ink); font-weight: 700; }
.rm-bl-d.presume { color: var(--color-saffron-ink); }
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

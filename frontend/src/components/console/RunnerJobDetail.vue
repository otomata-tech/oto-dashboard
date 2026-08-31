<script setup lang="ts">
// La fiche d'UN agent : ce qu'il a fait, et ce qu'il a laissé derrière lui.
//
// Jusqu'ici la file d'exécution ne permettait pas d'ouvrir un travail — on voyait
// qu'il avait tourné, pas ce qu'il avait produit. Le `result` était réduit à deux
// pastilles (« N écritures », « réservé, rien écrit ») ; le modèle, les étapes, le
// motif d'arrêt, les colonnes hors schéma et les postes de garde n'étaient nulle
// part, alors qu'ils sont servis.
//
// Deux partis pris :
//
// ① Les gardes en tête, avant l'identité même du travail. Un agent dont la garde
//    a réparé les écritures se conclut « terminé » ; si sa fiche ouvre sur son id
//    et ses horodatages, on referme avant d'arriver au seul fait qui comptait.
//
// ② Le `result` est rendu en TROIS temps, parce que son contrat est ouvert
//    (`extra=allow` côté backend) : les postes qu'on sait nommer, le relevé
//    d'outils, puis tout le reste sous sa clé brute. Le troisième temps n'est pas
//    de la complaisance — sans lui, un champ que le worker vient d'ajouter reste
//    invisible jusqu'à ce qu'on pense à le déclarer, et « l'écran ne le montre
//    pas » se lit « le worker ne le produit pas ».
import { computed, ref, watch } from 'vue'
import ModalOverlay from './ModalOverlay.vue'
import Tag from './Tag.vue'
import Icon from './Icon.vue'
import { getRunThread, type RunnerJob, type RunThreadMessage } from '@/api/console'
import { useMe } from '@/composables/useMe'
import { absDate } from '@/lib/cellRender'
import {
  GARDES, autresResultat, compteGarde, duree, outilsResultat, postesResultat,
  procOf, renvois, sejour, sejourMs, totalGardes,
} from '@/lib/runnerJobs'

const props = defineProps<{ job: RunnerJob | null }>()
const emit = defineEmits<{ close: [] }>()

const { me } = useMe()
const maintenant = ref(Date.now())

type Ton = 'olive' | 'terra' | 'saffron' | 'cobalt' | 'ink'
const TONE: Record<string, Ton> = {
  pending: 'saffron', claimed: 'cobalt', done: 'olive', failed: 'terra',
}
const LIBELLE: Record<string, string> = {
  pending: 'en attente', claimed: 'en cours', done: 'terminé', failed: 'en échec',
}

const j = computed(() => props.job)
const ouvert = computed(() => props.job !== null)

// ── Les gardes ──────────────────────────────────────────────────────────────
const gardes = computed(() => {
  const job = j.value
  if (!job) return []
  return GARDES
    .map((g) => ({ ...g, n: compteGarde(job, g.cle) }))
    .filter((g) => g.n > 0)
})

// ── Ce que le travail visait ────────────────────────────────────────────────
// Le payload porte des RÉFÉRENCES par contrat d'enqueue ; sa forme reste ouverte.
// On nomme ce qu'on reconnaît, on rend le reste tel quel.
const ETIQUETTES_PAYLOAD: Record<string, string> = {
  procedure: 'procédure',
  fleet: 'flotte',
  namespace: 'tableau',
  project_id: 'projet',
  tools: 'outils autorisés',
  label: 'libellé',
  max_steps: 'plafond d’étapes',
  input: 'référence passée au run',
}

function texte(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const tableau = computed(() => {
  const ns = j.value?.payload?.namespace
  return typeof ns === 'string' && ns ? ns : null
})

// Le lien vers LA LIGNE travaillée, quand le payload la nomme. Le datastore ne
// sert PAS l'inverse (`claimed_run`, qui relie une ligne à son run, n'est pas
// projeté par l'API) : sans référence dans le payload, il n'y a pas de chemin
// honnête du travail vers sa ligne, et on n'en invente pas.
const ligne = computed(() => {
  const p = j.value?.payload
  if (!p || !tableau.value) return null
  for (const cle of ['row_id', 'row', 'item_id']) {
    const v = p[cle]
    if (typeof v === 'string' && v) return v
    if (typeof v === 'number') return String(v)
  }
  return null
})

const visees = computed(() => {
  const p = j.value?.payload
  if (!p) return []
  return Object.entries(p)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([cle, v]) => ({ cle, label: ETIQUETTES_PAYLOAD[cle] ?? cle, valeur: texte(v) }))
})

// ── Ce que le travail a produit ─────────────────────────────────────────────
const postes = computed(() => (j.value ? postesResultat(j.value) : []))
const outils = computed(() => (j.value ? outilsResultat(j.value) : []))
const autres = computed(() => (j.value ? autresResultat(j.value) : []))

// `claimed_by` est le SUB du worker — opaque, il ne se montre pas brut, et « ton
// compte » n'apprend rien : on ne le nomme que lorsque le worker n'est PAS toi.
const worker = computed(() => {
  const c = j.value?.claimed_by
  if (!c) return null
  return c === me.value?.sub ? 'ton compte' : `${c.slice(0, 12)}…`
})

// ── Le fil ──────────────────────────────────────────────────────────────────
const fil = ref<RunThreadMessage[] | 'chargement' | 'erreur' | null>(null)

// ⚠️ Le tour est apposé sous `content`, PAS sous `text` : on accepte les deux
// formes — le chemin stateless appose du `text`, celui qui délègue la boucle au
// fournisseur appose du `content` accompagné d'un relevé d'outils.
function resume(m: RunThreadMessage): string {
  const c = m.content as Record<string, unknown> | null
  const brut = c?.content ?? c?.text
  const corps = typeof brut === 'string' ? brut : ''
  const appels = Array.isArray(c?.tool_calls)
    ? (c!.tool_calls as Array<{ name?: string }>).map((t) => t.name).filter(Boolean)
    : []
  const releve = typeof c?.tool_relevé === 'string' ? c.tool_relevé : ''
  const outilsDits = appels.length ? appels.join(', ') : releve
  if (corps && outilsDits) return `${corps}\n↳ ${outilsDits}`
  if (outilsDits) return `outils : ${outilsDits}`
  return corps || '—'
}

watch(() => props.job?.id, async () => {
  fil.value = null
  maintenant.value = Date.now()
  const runId = props.job?.run_id
  if (!runId) return
  fil.value = 'chargement'
  try {
    fil.value = (await getRunThread(runId)).messages
  } catch {
    fil.value = 'erreur'
  }
}, { immediate: true })
</script>

<template>
  <ModalOverlay :open="ouvert" @close="emit('close')">
    <div v-if="j" class="modal" role="dialog" aria-modal="true" aria-label="fiche d'un agent">
      <header class="jd-head">
        <div class="jd-head-txt">
          <h3 class="jd-title">
            Travail <span class="jd-id">#{{ j.id }}</span>
            <Tag :tone="TONE[j.status] ?? 'ink'">{{ LIBELLE[j.status] ?? j.status }}</Tag>
          </h3>
          <p class="jd-desc">
            {{ procOf(j) }}
            <span v-if="j.kind === 'continue'"> · reprise de fil</span>
            <span v-if="sejour(j, maintenant)"> · {{ sejour(j, maintenant) }}</span>
          </p>
        </div>
        <button class="jd-close" aria-label="fermer" @click="emit('close')">
          <Icon name="x" :size="16" />
        </button>
      </header>

      <div class="jd-body">
        <!-- ① Les gardes, avant tout le reste -->
        <div v-if="gardes.length" class="jd-garde">
          <div class="jd-garde-t">
            La garde est intervenue sur ce que cet agent a écrit
            <span class="jd-garde-n">{{ totalGardes(j) }}</span>
          </div>
          <ul class="jd-garde-l">
            <li v-for="g in gardes" :key="g.cle" :class="{ severe: g.severe }" :title="g.cle">
              <b>{{ g.n }}</b> {{ g.label }}
            </li>
          </ul>
        </div>

        <!-- ② L'échec, en toutes lettres -->
        <div v-if="j.last_error" class="jd-err">
          <div class="jd-err-t">
            {{ j.status === 'failed' ? 'Échec' : 'Dernier échec avant reprise' }}
            <span class="jd-err-n">{{ j.attempts }}/{{ j.max_attempts }} tentatives</span>
          </div>
          <p class="jd-err-m">{{ j.last_error }}</p>
        </div>
        <!-- Repris sans motif : personne n'a déclaré d'échec, le bail est mort. -->
        <p v-else-if="renvois(j)" class="jd-mute">
          Repris {{ renvois(j) }} fois sans motif déclaré — la marque d'un worker perdu
          en cours de bail, pas d'un échec de l'agent.
        </p>

        <!-- ③ L'identité -->
        <dl class="jd-meta">
          <div>
            <dt>créé</dt>
            <dd>{{ j.created_at ? absDate(String(j.created_at)) : '—' }}</dd>
          </div>
          <div>
            <dt>conclu</dt>
            <dd>{{ j.finished_at ? absDate(String(j.finished_at)) : 'pas encore' }}</dd>
          </div>
          <div>
            <dt>séjour</dt>
            <dd>{{ sejourMs(j, maintenant) !== null ? duree(sejourMs(j, maintenant)!) : '—' }}</dd>
          </div>
          <div>
            <dt>tentatives</dt>
            <dd>{{ j.attempts }} / {{ j.max_attempts }}</dd>
          </div>
          <div>
            <dt>worker</dt>
            <dd :title="j.claimed_by ?? ''">{{ worker ?? 'pas encore pris' }}</dd>
          </div>
          <div>
            <dt>run</dt>
            <dd class="mono">{{ j.run_id ?? 'aucun run ouvert' }}</dd>
          </div>
        </dl>

        <!-- ④ Ce qu'il visait -->
        <section v-if="visees.length" class="jd-sec">
          <h4 class="jd-sec-t">Ce qu'il visait</h4>
          <p v-if="tableau" class="jd-liens">
            <RouterLink :to="`/data/${encodeURIComponent(tableau)}`" class="jd-lien">
              ouvrir le tableau {{ tableau }}
            </RouterLink>
            <RouterLink
              v-if="ligne"
              :to="`/data/${encodeURIComponent(tableau)}/item/${encodeURIComponent(ligne)}`"
              class="jd-lien"
            >ouvrir la ligne travaillée</RouterLink>
          </p>
          <dl class="jd-meta">
            <div v-for="v in visees" :key="v.cle">
              <dt>{{ v.label }}</dt>
              <dd>{{ v.valeur }}</dd>
            </div>
          </dl>
        </section>

        <!-- ⑤ Ce qu'il a produit -->
        <section class="jd-sec">
          <h4 class="jd-sec-t">Ce qu'il a produit</h4>
          <p v-if="!postes.length && !outils.length && !autres.length" class="jd-vide">
            Ce travail n'a rien déclaré à sa conclusion — soit il n'est pas encore
            conclu, soit le worker n'a rendu aucun relevé.
          </p>
          <dl v-if="postes.length" class="jd-meta">
            <div v-for="p in postes" :key="p.cle">
              <dt>{{ p.label }}</dt>
              <dd :class="{ attention: p.ton === 'attention', alerte: p.ton === 'alerte' }">
                {{ p.valeur }}
              </dd>
            </div>
          </dl>
          <div v-if="outils.length" class="jd-outils">
            <div class="jd-outils-t">Outils appelés avec succès</div>
            <ul>
              <li v-for="o in outils" :key="o.outil">
                <span class="mono">{{ o.outil }}</span><b>{{ o.n }}</b>
              </li>
            </ul>
          </div>
          <!-- Le contrat est ouvert : ce que le worker déclare en plus se montre
               sous sa clé, plutôt que de disparaître faute d'étiquette. -->
          <dl v-if="autres.length" class="jd-meta jd-autres">
            <div v-for="a in autres" :key="a.cle">
              <dt class="mono">{{ a.cle }}</dt>
              <dd>{{ a.valeur }}</dd>
            </div>
          </dl>
        </section>

        <!-- ⑥ Le fil -->
        <section class="jd-sec">
          <h4 class="jd-sec-t">Son fil</h4>
          <p v-if="!j.run_id" class="jd-vide">
            Ce travail n'a pas ouvert de run — il n'a pas de fil à lire.
          </p>
          <p v-else-if="fil === 'chargement'" class="jd-vide">chargement…</p>
          <p v-else-if="fil === 'erreur'" class="jd-vide">
            Fil illisible — il est réservé au propriétaire du run.
          </p>
          <!-- Un fil vide n'est pas une panne : quand la boucle d'outils tourne
               chez le fournisseur, le verbatim des tours ne nous revient pas. -->
          <p v-else-if="Array.isArray(fil) && !fil.length" class="jd-vide">
            Aucun tour conservé — les runs dont la boucle d'outils s'exécute chez le
            fournisseur ne rendent qu'une synthèse.
          </p>
          <div v-else-if="Array.isArray(fil)" class="jd-fil">
            <div v-for="msg in fil" :key="msg.seq" class="jd-msg" :data-role="msg.role">
              <span class="jd-role">{{ msg.role }}</span>
              <span class="jd-txt">{{ resume(msg) }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </ModalOverlay>
</template>

<style scoped>
.modal {
  width: 100%; max-width: 720px; max-height: 86vh; display: flex; flex-direction: column;
  background: var(--color-bg); border: 1px solid var(--color-hair); border-radius: 14px;
  box-shadow: 0 18px 50px -12px color-mix(in srgb, var(--color-ink) 35%, transparent);
}
.jd-head { display: flex; align-items: flex-start; gap: 8px; padding: 16px 18px 12px; }
.jd-head-txt { flex: 1; min-width: 0; }
.jd-title {
  margin: 0; font-size: 16px; font-weight: 700; color: var(--color-ink);
  display: flex; align-items: center; gap: 9px;
}
.jd-id { font-family: var(--font-mono, monospace); color: var(--color-faint); font-weight: 600; }
.jd-desc { margin: 4px 0 0; font-size: 12px; color: var(--color-mute); }
.jd-close {
  flex: none; border: 0; background: transparent; cursor: pointer; padding: 3px;
  border-radius: 7px; color: var(--color-faint); line-height: 0;
}
.jd-close:hover { background: var(--color-paper-2); color: var(--color-ink); }
.jd-body {
  overflow-y: auto; padding: 0 18px 18px;
  display: flex; flex-direction: column; gap: 15px;
}

.jd-garde {
  border: 1px solid var(--color-terra-soft);
  background: color-mix(in srgb, var(--color-terra-soft) 34%, transparent);
  border-radius: var(--radius-md); padding: 10px 12px;
}
.jd-garde-t {
  font-weight: 700; font-size: 12.5px; color: var(--color-terra-ink);
  display: flex; align-items: center; gap: 8px;
}
.jd-garde-n {
  font-family: var(--font-mono, monospace); font-size: 11px; font-weight: 600;
  background: var(--color-surface); border-radius: var(--radius-pill); padding: 1px 8px;
}
.jd-garde-l { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.jd-garde-l li {
  font-size: 12px; padding: 2px 9px; border-radius: var(--radius-pill);
  background: var(--color-surface); border: 1px solid var(--color-terra-soft); color: var(--color-ink);
}
.jd-garde-l li.severe { border-color: var(--color-terra-ink); color: var(--color-terra-ink); font-weight: 600; }
.jd-garde-l b { font-family: var(--font-mono, monospace); }

.jd-err {
  background: var(--color-terra-soft); color: var(--color-terra-ink);
  border-radius: var(--radius-md); padding: 10px 12px;
}
.jd-err-t { font-weight: 700; font-size: 12.5px; display: flex; align-items: baseline; gap: 8px; }
.jd-err-n { font-weight: 400; font-size: 11px; opacity: .8; }
.jd-err-m { margin: 5px 0 0; font-size: 12.5px; white-space: pre-wrap; word-break: break-word; }
.jd-mute { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--color-mute); }

.jd-meta {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px 20px; margin: 0;
}
.jd-meta dt {
  font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em;
  color: var(--color-faint); margin-bottom: 2px;
}
.jd-meta dd { margin: 0; font-size: 12.5px; color: var(--color-ink); word-break: break-word; }
.jd-meta dd.attention { color: var(--color-saffron-ink); font-weight: 600; }
.jd-meta dd.alerte { color: var(--color-terra-ink); font-weight: 600; }
.jd-autres dt { text-transform: none; letter-spacing: 0; }

.jd-sec { border-top: 1px solid var(--color-hair); padding-top: 13px; display: flex; flex-direction: column; gap: 10px; }
.jd-sec-t { margin: 0; font-size: 12px; font-weight: 700; color: var(--color-ink); }
.jd-vide { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--color-mute); }
.jd-liens { margin: 0; display: flex; flex-wrap: wrap; gap: 14px; }
.jd-lien { font-size: 12.5px; font-weight: 600; color: var(--color-saffron-ink); }
.jd-lien:hover { color: var(--color-ink); }

.jd-outils-t {
  font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em;
  color: var(--color-faint); margin-bottom: 5px;
}
.jd-outils ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 5px; }
.jd-outils li {
  display: inline-flex; align-items: baseline; gap: 6px; font-size: 11.5px;
  border: 1px solid var(--color-hair); border-radius: var(--radius-pill); padding: 1px 9px;
  color: var(--color-mute);
}
.jd-outils li b { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--color-ink); }

.jd-fil {
  border-left: 2px solid var(--color-hair); padding: 2px 0 2px 10px;
  display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow-y: auto;
}
.jd-msg { display: flex; gap: 8px; font-size: 12px; }
.jd-role {
  flex: 0 0 60px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em;
  color: var(--color-faint);
}
.jd-txt { color: var(--color-mute); white-space: pre-wrap; word-break: break-word; }
.jd-msg[data-role='assistant'] .jd-txt { color: var(--color-ink); }
.mono { font-family: var(--font-mono, monospace); }
</style>

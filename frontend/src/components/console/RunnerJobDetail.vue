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
import RunnerGardes from './RunnerGardes.vue'
import {
  getNamespaceQueue, getRunThread, type RunnerJob, type RunThreadMessage,
} from '@/api/console'
import { useMe } from '@/composables/useMe'
import { absDate } from '@/lib/cellRender'
import { bailLigne } from '@/lib/bailDeLigne'
import {
  autresResultat, bail, duree, outilsResultat, postesResultat,
  procOf, relevesGardes, renvois, sejour, sejourMs, totalGardes,
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
// Ici on montre les NOMS, pas des comptes : sur une seule fiche, « 2 valeurs
// réparées » n'aide pas — « ville, telephone » dit quelle colonne aller relire.
const releves = computed(() => (j.value ? relevesGardes(j.value) : []))
const garnies = computed(() =>
  releves.value.filter((g) => g.etat === 'garni')
    .map((g) => ({ ...g, texte: g.noms.join(', ') })))
// ⚠️ Ni succès ni échec : la garde n'a PAS tourné (`null`), ou son relevé est
// d'une forme qu'on ne sait pas lire. Sans ce bloc, la fiche d'un travail non
// vérifié serait indiscernable de celle d'un travail vérifié propre.
const aveugles = computed(() =>
  releves.value.filter((g) => g.etat === 'non-mesure' || g.etat === 'illisible')
    .map((g) => ({ ...g, texte: g.etat === 'illisible' ? `relevé illisible : ${g.brut}` : '' })))
const verifiees = computed(() => releves.value.filter((g) => g.etat === 'neant'))

// ── Le bail de la prise ─────────────────────────────────────────────────────
// ⚠️ Se lit CONTRE le statut : sur un travail conclu, une date passée est le bail
// qui ÉTAIT tenu — pas un bail « expiré ». Dire « expiré » là accuserait de mort
// un travail terminé normalement.
const LIB_BAIL: Record<string, string> = {
  'en-cours': 'court jusqu’à', expire: 'expiré depuis', tenu: 'tenu jusqu’à',
}
const bailDit = computed(() => {
  const job = j.value
  if (!job) return null
  const b = bail(job, maintenant.value)
  if (b.etat === 'aucun' || b.fin === null) return null
  const quand = absDate(new Date(b.fin).toISOString())
  return {
    etat: b.etat,
    texte: `${LIB_BAIL[b.etat]} ${quand}`,
    // Le seul cas qui appelle un geste : le worker est parti, le job attend d'être
    // repris. Ailleurs, la date est un fait, pas une alerte.
    alerte: b.etat === 'expire',
  }
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

// Le lien vers la ligne, quand le PAYLOAD la nomme — un travail enfilé sur une
// ligne précise porte sa référence, et c'est le seul chemin qui vaut aussi après
// la conclusion.
const lignePayload = computed(() => {
  const p = j.value?.payload
  if (!p || !tableau.value) return null
  for (const cle of ['row_id', 'row', 'item_id']) {
    const v = p[cle]
    if (typeof v === 'string' && v) return v
    if (typeof v === 'number') return String(v)
  }
  return null
})

// ── La ligne que ce travail TIENT ───────────────────────────────────────────
// `_claimed_run` (oto-backend #723) relie enfin une ligne au run qui la tient. On
// la résout en lisant la file de travail du tableau visé et en y cherchant notre
// run.
//
// ⚠️ ET IL RÉPOND À UNE SEULE QUESTION : « quelle ligne ce run tient-il MAINTENANT »,
// jamais « laquelle a-t-il travaillée ». La colonne est effacée à la libération.
// Sur un travail CONCLU il n'y a donc rien à résoudre — et l'écran le DIT, au lieu
// de laisser un silence qui se lirait « ce travail n'a touché aucune ligne ».
type LigneTenue =
  | { etat: 'sans-objet' }      // pas de run, pas de tableau : la question ne se pose pas
  | { etat: 'chargement' }
  | { etat: 'trouvee'; id: string }
  | { etat: 'aucune' }          // le run ne tient aucune ligne de ce tableau en ce moment
  | { etat: 'illisible' }       // la file du tableau ne nous est pas lisible
  | { etat: 'liberee' }         // travail conclu : le lien n'existe pas, et c'est connu
const tenue = ref<LigneTenue>({ etat: 'sans-objet' })

async function resoudreLigneTenue(job: RunnerJob | null) {
  tenue.value = { etat: 'sans-objet' }
  if (!job?.run_id) return
  if (job.status !== 'claimed') {
    // Conclu ou pas encore pris : la colonne ne porte plus (ou pas encore) ce run.
    if (job.status === 'done' || job.status === 'failed') tenue.value = { etat: 'liberee' }
    return
  }
  const ns = tableau.value
  if (!ns) return
  tenue.value = { etat: 'chargement' }
  try {
    const { rows } = await getNamespaceQueue(ns)
    const maintenantMs = Date.now()
    const trouvee = rows.find((r) => bailLigne(r, maintenantMs).run === job.run_id)
    tenue.value = trouvee ? { etat: 'trouvee', id: trouvee._id } : { etat: 'aucune' }
  } catch {
    tenue.value = { etat: 'illisible' }
  }
}

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
  void resoudreLigneTenue(props.job)
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
        <RunnerGardes
          titre="La garde est intervenue sur ce que cet agent a écrit"
          sous="Ce travail s'est conclu sans erreur : la garde a rattrapé ce qu'il avait
                écrit. Les colonnes nommées ci-dessous sont à relire avant de se fier au tableau."
          :garnies="garnies" :aveugles="aveugles" :verifiees="verifiees"
        >
          <template #compteur>
            <span class="jd-garde-n">{{ totalGardes(j) }}</span>
          </template>
        </RunnerGardes>

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
          <!-- Le bail RÉEL de la prise, servi depuis oto-backend #723. Il remplace
               la présomption d'ancienneté : « expiré » n'est plus une déduction. -->
          <div v-if="bailDit">
            <dt>bail</dt>
            <dd :class="{ alerte: bailDit.alerte }">{{ bailDit.texte }}</dd>
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
              v-if="lignePayload"
              :to="`/data/${encodeURIComponent(tableau)}/item/${encodeURIComponent(lignePayload)}`"
              class="jd-lien"
            >ouvrir la ligne visée</RouterLink>
            <RouterLink
              v-if="tenue.etat === 'trouvee'"
              :to="`/data/${encodeURIComponent(tableau)}/item/${encodeURIComponent(tenue.id)}`"
              class="jd-lien"
            >ouvrir la ligne qu'il tient</RouterLink>
          </p>
          <!-- ⚠️ On dit ce qu'on ne peut PAS montrer. Le tableau n'enregistre que la
               ligne qu'un run tient EN CE MOMENT ; elle est libérée à la conclusion.
               Laisser un silence ici se lirait « ce travail n'a touché aucune ligne ». -->
          <p v-if="tenue.etat === 'liberee'" class="jd-vide">
            La ligne qu'il a travaillée n'est plus retrouvable : le tableau ne retient
            que la ligne qu'un agent tient sur le moment, et elle est relâchée à la
            conclusion. Le journal du tableau, lui, garde la trace de l'écriture.
          </p>
          <p v-else-if="tenue.etat === 'aucune'" class="jd-vide">
            Cet agent ne tient aucune ligne de ce tableau en ce moment — il n'en a pas
            encore réservé, ou il l'a déjà rendue.
          </p>
          <p v-else-if="tenue.etat === 'illisible'" class="jd-vide">
            La file de travail de ce tableau ne t'est pas lisible : impossible de dire
            quelle ligne cet agent tient.
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

.jd-garde-n {
  font-family: var(--font-mono, monospace); font-size: 11px; font-weight: 600;
  background: var(--color-surface); border-radius: var(--radius-pill); padding: 1px 8px;
}

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

<script setup lang="ts">
// Relance des comptes inactifs — la console d'une capacité qui FAIT PARTIR DES MAILS.
//
// ⚠️ **Cet écran n'ouvre aucun raccourci.** Il poste sur `/api/admin/outreach`, qui
// passe par exactement la même autorisation et le même code que le verbe
// conversationnel `oto_admin_outreach` : par construction, il ne peut rien contourner.
// Les cinq verrous vivent au serveur, et le travail de cet écran est de les RENDRE
// VISIBLES — jamais de les rejouer, jamais de les alléger :
//
//   1. **Tenant partenaire écarté** par la requête elle-même, en amont de tout critère.
//      Rien à faire ici : il n'y a pas de case à cocher, et c'est voulu.
//   2. **Pas de doublon** — index unique `(campagne, compte)`, écrit AVANT l'envoi.
//      L'écran affiche `previous_outreach` pour que l'opérateur sache qu'il écrit à
//      quelqu'un une seconde fois ; c'est la base qui refuse, pas nous.
//      ⚠️ Cet index ne voit que le COMPTE. Ce qui reçoit le message est une BOÎTE
//      MAIL, et un humain peut s'être inscrit deux fois : c'est la LECTURE de
//      l'audience qui regroupe par adresse, et `accounts` sur une ligne dit combien
//      de comptes y ont fusionné.
//   3. **Rien ne part avant un essai REÇU** pour ce contenu exact et pour CHAQUE
//      langue servie. L'écran n'arme donc `Envoyer` qu'une fois l'essai constaté par
//      le serveur — et **toute retouche du texte invalide l'aperçu**, donc l'essai.
//   4. **Le nombre est annoncé puis confirmé à l'identique** : la confirmation dit N,
//      et c'est ce même N qui part en `confirm`. Le serveur refuse s'il a bougé.
//      Plafond dur au-delà de `OUTREACH_MAX_ENVOI`.
//   5. **Lien de désinscription** dans chaque message, et un désinscrit quitte toute
//      audience. L'aperçu, lui, n'en porte pas : il n'a pas de destinataire.
//
// ⚠️ **Un écran qui « simplifierait » en sautant l'essai ou la confirmation serait
// pire que pas d'écran.** Il ne contournerait rien — le serveur refuserait — mais il
// aurait menti sur l'état du garde, et c'est le mensonge qui coûte.
import { computed, onMounted, ref, watch } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import OtoSelect from '@/components/console/OtoSelect.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import Notice from '@/components/console/Notice.vue'
import StateError from '@/components/console/StateError.vue'
import SubTabs, { type SubTab } from '@/components/console/SubTabs.vue'
import OutreachRecipients from '@/components/console/outreach/OutreachRecipients.vue'
import OutreachJournal from '@/components/console/outreach/OutreachJournal.vue'
import { useToast } from '@/composables/useToast'
import { usePrompt } from '@/composables/usePrompt'
import { useMe, isSuperAdmin } from '@/composables/useMe'
import {
  getOutreachAudience, getOutreachPreview, sendOutreachTest, sendOutreach,
  getOutreachJournal, getOutreachOptouts, clearOutreachOptout,
} from '@/api/console'
import { explain } from '@/lib/errors'
import {
  BLOCKER_MESSAGE, defaultContent, sendBlockers, servedLocales, untestedLocales,
  type Locale, type SendState,
} from '@/lib/outreach'
import { OUTREACH_MAX_ENVOI } from '@/types/api'
import type {
  OutreachInput, OutreachOptout, OutreachResult, OutreachRow, OutreachSend,
  OutreachStatus,
} from '@/types/api'

const { toast } = useToast()
const { confirmAction } = usePrompt()
const { me } = useMe()

// Consulter l'audience = supervision (platform_admin). Faire PARTIR un mail, ou lever
// le refus de quelqu'un, est un acte de plateforme : le serveur le réserve au
// super_admin, et l'écran OMET ces boutons plutôt que de les griser.
const canSend = computed(() => isSuperAdmin(me.value))

const TABS: SubTab[] = [
  { key: 'campagne', label: 'campagne', hint: 'audience, message, essai, envoi' },
  { key: 'registres', label: 'registres', hint: 'ce qui est parti, et qui a refusé' },
]
const tab = ref('campagne')

// ── ce que l'opérateur choisit ───────────────────────────────────────────────
const campaign = ref('')
const status = ref<OutreachStatus>('never_active')
const dormantDays = ref(30)
// ⚠️ **Anglais par défaut** : c'est la langue de la campagne, et la préférence
// DÉCLARÉE d'un compte prime toujours dessus (le serveur la résout, pas nous). Ce
// choix appartient à l'opérateur — rien ne le déduit de l'adresse.
const defaultLocale = ref<Locale>('en')
// ⚠️ **Pré-rempli, pas verrouillé.** On n'ouvre pas cet écran sur une page blanche :
// le brouillon (`lib/outreach.ts`) est là pour être relu et réécrit dans le champ,
// et il porte l'origine de chacune de ses phrases. Le pré-remplir ne rapproche
// personne d'un envoi — les verrous sont derrière (aperçu, essai reçu, confirmation
// du nombre), et toute retouche du texte les re-arme.
const content = ref(defaultContent())
const onlyRaw = ref('')

// ── ce que le serveur a répondu ──────────────────────────────────────────────
const rows = ref<OutreachRow[]>([])
const total = ref(0)
const selected = ref(0)
const truncated = ref(false)
const withDeclared = ref(0)
const withDefault = ref(0)
const previewHtml = ref<Record<string, string>>({})
const fingerprint = ref<string | null>(null)
const testedLocales = ref<string[]>([])
const outcome = ref(false)
// La taille de CHAQUE segment, mesurée ensemble : Alexis a tranché pour UN SEUL
// message, et voir les deux nombres côte à côte est ce qui rend cette décision
// tenable — même campagne, même texte, un essai qui vaut pour les deux.
// ⚠️ `null` = **non mesuré** (l'appel a échoué), jamais zéro. Afficher « 0 venus
// puis repartis » là où personne n'a regardé ferait prendre une décision de
// campagne sur un chiffre qui n'existe pas.
const segments = ref<Record<string, number | null>>({})

const busy = ref(false)
const error = ref<string | null>(null)
const sends = ref<OutreachSend[]>([])
const optouts = ref<OutreachOptout[]>([])

const locales = computed(() => servedLocales(rows.value, defaultLocale.value))
const etat = computed<SendState>(() => ({
  campaign: campaign.value, content: content.value, locales: locales.value,
  selected: selected.value, total: total.value, max: OUTREACH_MAX_ENVOI,
  fingerprint: fingerprint.value, testedLocales: testedLocales.value,
}))
const blockers = computed(() => sendBlockers(etat.value))
const manqueEssai = computed(() => untestedLocales(etat.value))
// On nomme le PREMIER obstacle, pas les cinq à la fois : un opérateur bloqué doit
// lire son prochain geste, pas un inventaire.
const premierBlocage = computed(() =>
  blockers.value.length ? BLOCKER_MESSAGE[blockers.value[0]!] : null)

// Les champs de contenu sont nommés par langue (`subject_fr`, `body_en`…). On dérive
// la clé plutôt que de caster : le jour où une troisième langue arrive, le type dit
// s'il manque un champ, au lieu de laisser un `undefined` silencieux dans un mail.
type ContentKey = keyof typeof content.value
const champ = (quoi: 'subject' | 'body' | 'cta_label', lg: string) =>
  `${quoi}_${lg}` as ContentKey

const SEGMENT_LABEL: Record<OutreachStatus, string> = {
  never_active: 'jamais entrés', dormant: 'venus puis repartis',
}
/** Les deux segments écrits côte à côte, ou `null` tant qu'un seul est connu. Un
 *  segment non mesuré se dit « non mesuré » — pas « 0 ». */
const ligneSegments = computed(() => {
  const vus = Object.keys(segments.value)
  if (vus.length < 2) return null
  return (['never_active', 'dormant'] as OutreachStatus[])
    .filter((k) => k in segments.value)
    .map((k) => segments.value[k] === null
      ? `${SEGMENT_LABEL[k]} : non mesuré`
      : `${segments.value[k]} ${SEGMENT_LABEL[k]}`)
    .join(', ')
})

function params(): Omit<OutreachInput, 'op'> {
  return {
    campaign: campaign.value.trim(), status: status.value,
    dormant_days: dormantDays.value, default_locale: defaultLocale.value,
    ...content.value,
    only: onlyRaw.value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean),
  }
}

function absorbe(r: OutreachResult, withPreview = false) {
  rows.value = r.recipients
  total.value = r.total
  selected.value = r.selected
  truncated.value = r.truncated
  withDeclared.value = r.with_declared_locale
  withDefault.value = r.with_default_locale
  if (withPreview) {
    previewHtml.value = r.preview_html
    fingerprint.value = r.fingerprint
    testedLocales.value = r.tested_locales
  }
}

// ⚠️ **Toute retouche invalide l'aperçu, donc l'essai.** L'empreinte que le serveur a
// rendue ne décrit plus ce qui partirait : la garder afficherait « essai reçu » pour
// un texte qui n'a jamais été essayé. On l'efface, et l'envoi se re-verrouille seul.
watch([content, campaign, status, dormantDays, defaultLocale, onlyRaw], () => {
  fingerprint.value = null
  previewHtml.value = {}
  testedLocales.value = []
  outcome.value = false
}, { deep: true })

async function appelle(fn: () => Promise<OutreachResult>, withPreview = false) {
  busy.value = true
  error.value = null
  try {
    absorbe(await fn(), withPreview)
  } catch (e) {
    error.value = explain(e)
  } finally {
    busy.value = false
  }
}

async function voirAudience() {
  await appelle(() => getOutreachAudience(params()))
  if (error.value) return
  // Les deux segments d'un coup : le second sert à décider, pas à envoyer.
  const autre: OutreachStatus = status.value === 'never_active' ? 'dormant' : 'never_active'
  segments.value = { [status.value]: total.value }
  try {
    const r = await getOutreachAudience({ ...params(), status: autre })
    segments.value = { ...segments.value, [autre]: r.total }
  } catch {
    // L'échec ne doit ni masquer l'audience qu'on vient d'obtenir, ni se déguiser en
    // « 0 » : on le DIT. « Pas mesuré » et « rien trouvé » ne sont pas la même nouvelle.
    segments.value = { ...segments.value, [autre]: null }
  }
}

const apercu = () => appelle(() => getOutreachPreview(params()), true)

async function essai() {
  if (!await confirmAction({
    title: 'T\'envoyer l\'essai',
    confirmLabel: 'M\'envoyer l\'essai',
    message: `un message part vers TA propre boîte, une fois par langue servie `
      + `(${locales.value.join(', ')}). rien ne part vers l'audience. `
      + 'c\'est cet essai reçu qui déverrouille l\'envoi.',
  })) return
  await appelle(() => sendOutreachTest(params()), true)
  if (!error.value) toast('essai envoyé — lis-le avant d\'envoyer')
}

async function envoyer() {
  // Le nombre ANNONCÉ est celui que l'écran affiche, et c'est ce même nombre qui part
  // en `confirm`. Si l'audience a bougé entre-temps, le serveur refuse — et c'est
  // exactement ce qu'on veut : personne ne confirme un chiffre qu'il n'a pas lu.
  const n = selected.value
  if (!await confirmAction({
    title: `Envoyer à ${n} personne${n > 1 ? 's' : ''}`, danger: true,
    confirmLabel: `Envoyer à ${n}`,
    message: `${n} personne${n > 1 ? 's' : ''} recevront ce message `
      + `(${locales.value.join(', ')}), campagne « ${campaign.value.trim()} ». `
      + 'chaque message porte un lien de désinscription. c\'est irréversible.',
  })) return
  await appelle(() => sendOutreach({ ...params(), confirm: n }), false)
  if (error.value) return
  outcome.value = true
  toast(`${rows.value.filter((r) => r.sent).length} message(s) parti(s)`)
  await chargeRegistres()
}

async function chargeRegistres() {
  try {
    const [j, o] = await Promise.all([
      getOutreachJournal(campaign.value.trim() || undefined),
      getOutreachOptouts(),
    ])
    sends.value = j.log
    optouts.value = o.optouts
  } catch (e) {
    error.value = explain(e)
  }
}

async function reinscrire(target: string) {
  if (!await confirmAction({
    title: 'Lever une désinscription', danger: true, confirmLabel: 'Ré-inscrire',
    message: 'ne le fais QUE si la personne l\'a explicitement demandé. '
      + 'elle redeviendra joignable par toutes les campagnes.',
  })) return
  busy.value = true
  try {
    optouts.value = (await clearOutreachOptout(target)).optouts
    toast('refus levé')
  } catch (e) {
    toast(explain(e))
  } finally {
    busy.value = false
  }
}

onMounted(chargeRegistres)
</script>

<template>
  <div class="content-inner fadein">
    <SubTabs :tabs="TABS" :model-value="tab" @update:model-value="tab = $event" />

    <StateError v-if="error && !rows.length" :message="error" @retry="voirAudience" />

    <template v-if="tab === 'campagne'">
      <ConsoleCard title="Campagne"
        sub="le nom de campagne est la clé du « une seule fois par personne » — deux relances distinctes, deux noms.">
        <div class="grid3">
          <label class="f">
            <span class="f-l">nom de campagne</span>
            <input v-model="campaign" class="inp mono" :disabled="busy"
              placeholder="onboarding-2026-09" />
          </label>
          <div class="f">
            <span class="f-l">segment</span>
            <OtoSelect v-model="status" grow :disabled="busy"
              aria-label="segment d'audience" :options="[
                { value: 'never_active', label: 'jamais entrés (aucun appel)' },
                { value: 'dormant', label: 'venus puis repartis' }]" />
          </div>
          <div class="f">
            <span class="f-l">langue par défaut</span>
            <OtoSelect v-model="defaultLocale" grow :disabled="busy"
              aria-label="langue par défaut" :options="[
                { value: 'en', label: 'anglais' }, { value: 'fr', label: 'français' }]" />
          </div>
        </div>

        <div class="grid3 mt">
          <label v-if="status === 'dormant'" class="f">
            <span class="f-l">silencieux depuis (jours)</span>
            <input v-model.number="dormantDays" class="inp" type="number" min="1"
              :disabled="busy" />
          </label>
          <label class="f wide">
            <span class="f-l">restreindre à ces adresses (optionnel)</span>
            <input v-model="onlyRaw" class="inp mono" :disabled="busy"
              placeholder="pour dérouler par paliers — laisse vide pour tout le segment" />
          </label>
        </div>

        <!-- ⚠️ La langue ne se DEVINE pas. Le seul signal est la préférence déclarée
             dans le dashboard ; le domaine de l'adresse n'en est pas un. -->
        <p class="hint">
          La préférence de langue déclarée par un compte l'emporte toujours sur ce
          défaut. Rien n'est déduit du domaine de l'adresse : un « .com » peut être
          français, un « .fr » une filiale.
        </p>

        <div class="row-actions">
          <Btn icon="users" :disabled="busy || !campaign.trim()" @click="voirAudience">
            Voir l'audience</Btn>
        </div>

        <!-- Les deux segments côte à côte : un seul message les couvre tous les deux,
             sous le MÊME nom de campagne et avec le MÊME texte — donc un seul essai. -->
        <Notice v-if="ligneSegments" tone="info" class="mt">
          {{ ligneSegments }}. Le même message peut couvrir les deux : garde le même
          nom de campagne et le même texte, change seulement le segment — l'essai vaut
          alors pour les deux envois, et personne n'est relancé deux fois.
        </Notice>
      </ConsoleCard>

      <template v-if="rows.length || selected">
        <OutreachRecipients :rows="rows" :total="total" :selected="selected"
          :truncated="truncated" :with-declared="withDeclared" :with-default="withDefault"
          :show-outcome="outcome" />

        <ConsoleCard title="Message"
          :sub="`une version par langue servie — ${locales.join(', ')}. le corps est du texte brut : une ligne vide sépare deux paragraphes.`">
          <div v-for="lg in locales" :key="lg" class="lang">
            <div class="lang-h"><Tag tone="ink">{{ lg }}</Tag></div>
            <label class="f">
              <span class="f-l">sujet</span>
              <input v-model="content[champ('subject', lg)]" class="inp"
                :disabled="busy" />
            </label>
            <label class="f">
              <span class="f-l">corps</span>
              <textarea v-model="content[champ('body', lg)]" class="inp ta"
                rows="8" :disabled="busy"></textarea>
            </label>
            <label class="f">
              <span class="f-l">libellé du bouton (optionnel)</span>
              <input v-model="content[champ('cta_label', lg)]" class="inp"
                :disabled="busy" />
            </label>
          </div>
          <label class="f">
            <span class="f-l">adresse du bouton (commune aux langues)</span>
            <input v-model="content.cta_url" class="inp mono" :disabled="busy"
              placeholder="https://…" />
          </label>

          <div class="row-actions">
            <Btn icon="eye" :disabled="busy || !campaign.trim()" @click="apercu">
              Aperçu</Btn>
          </div>
        </ConsoleCard>

        <ConsoleCard v-if="Object.keys(previewHtml).length" title="Aperçu"
          sub="le message tel qu'il sera rendu, langue par langue.">
          <!-- ⚠️ L'aperçu n'a pas de destinataire, donc pas de lien de désinscription :
               fabriquer un jeton pour personne donnerait un lien mort. Le message réel
               en porte toujours un. -->
          <Notice tone="info">
            L'aperçu est rendu sans lien de désinscription — il n'a pas de
            destinataire. Chaque message réellement envoyé en porte un.
          </Notice>
          <!-- ⚠️ Le serveur rend un DOCUMENT COMPLET (`<head>`, fond, carte, pied) :
               l'injecter dans une div en perdrait la tête et laisserait ses styles
               fuir dans la console. Une iframe cloisonnée le rend pour ce qu'il est —
               une page — et `sandbox` vide lui interdit script et navigation. -->
          <div v-for="(html, lg) in previewHtml" :key="lg" class="prev">
            <div class="lang-h"><Tag tone="ink">{{ lg }}</Tag></div>
            <iframe class="prev-box" :srcdoc="html" sandbox=""
              :title="`aperçu du message en ${lg}`"></iframe>
          </div>
        </ConsoleCard>

        <ConsoleCard title="Essai, puis envoi"
          sub="rien ne part vers l'audience avant que tu aies reçu ce message exact, dans chaque langue servie.">
          <Notice v-if="fingerprint && !manqueEssai.length" tone="ok">
            Essai reçu pour ce texte, en {{ testedLocales.join(', ') }}.
          </Notice>
          <Notice v-else-if="premierBlocage" tone="warn">
            {{ premierBlocage }}
          </Notice>

          <p v-if="total > OUTREACH_MAX_ENVOI" class="hint">
            Plafond d'un envoi : {{ OUTREACH_MAX_ENVOI }} destinataires.
          </p>

          <!-- Boutons OMIS — pas grisés — pour qui n'a pas le droit de les utiliser. -->
          <div v-if="canSend" class="row-actions">
            <Btn kind="ghost" icon="mail" :disabled="busy || !campaign.trim()"
              @click="essai">M'envoyer l'essai</Btn>
            <Btn icon="zap" :disabled="busy || blockers.length > 0" @click="envoyer">
              Envoyer à {{ selected }}</Btn>
          </div>
          <p v-else class="hint">
            L'envoi est réservé à un administrateur de plateforme. Tu peux préparer la
            campagne et relire l'audience ; c'est lui qui déclenche l'essai et l'envoi.
          </p>
        </ConsoleCard>
      </template>
    </template>

    <OutreachJournal v-else :sends="sends" :optouts="optouts" :can-clear="canSend"
      :busy="busy" @clear="reinscrire" />
  </div>
</template>

<style scoped>
.f { display: flex; flex-direction: column; gap: 5px; }
.f-l {
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--color-faint);
}
.f.wide { grid-column: span 2; }
.ta { min-height: 140px; resize: vertical; line-height: 1.5; font-family: inherit; }
.lang { margin-bottom: 20px; display: flex; flex-direction: column; gap: 12px; }
.lang-h { margin-bottom: 2px; }
.prev { margin-top: 14px; }
.prev-box {
  display: block; width: 100%; height: 460px; border: 1px solid var(--color-card-bd);
  border-radius: var(--radius-md); background: #fff;
}
.mt { margin-top: 14px; }
.row-actions { margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; }
.hint { font-size: 12px; color: var(--color-mute); margin: 14px 0 0; line-height: 1.5; }
</style>

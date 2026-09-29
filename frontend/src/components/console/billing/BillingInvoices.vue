<script setup lang="ts">
// Les factures de l'organisation — l'écran qui manquait à une promesse écrite.
//
// ⚠️ Les CGV publiées engagent Otomata mot pour mot : « Chaque encaissement donne
// lieu à une facture, envoyée par courrier électronique et **téléchargeable depuis
// manage.oto.cx** », et elle « reste téléchargeable au format PDF ». La liste et le
// PDF sont servis par oto-commerce (`GET /orgs/{id}/factures`, `…/{id}/pdf`), qui a
// repris les factures du cœur. Ce composant est cette porte, et rien d'autre.
//
// Trois règles que le typecheck ne voit pas, et qui tiennent la promesse :
//
//   1. **Le passé compte autant que le présent.** La carte s'affiche dès qu'il y a
//      une facture, sans regarder si l'abonnement est encore ouvert : « reste
//      téléchargeable » vaut aussi après une résiliation. La gater sur
//      `subscribed` rendrait invisibles les factures de qui vient de partir —
//      exactement celles qu'on réclame ensuite à son comptable.
//   2. **Un `pending` n'est pas un paiement perdu.** L'encaissement a eu lieu, seul
//      le document tarde et il est rejoué automatiquement. La ligne se montre, avec
//      son montant, et la copie rassure au lieu d'alarmer.
//   3. **Aucun lien mort.** Le bouton n'existe que si le commerce sert `pdf: true` — il
//      y a un fichier au bout. Un document émis sans fichier le DIT, au lieu d'offrir un
//      clic qui tomberait sur `404 no_invoice_pdf`.
//
// La lecture est faite ICI plutôt que dans la vue, et elle est TOLÉRANTE : ces
// factures complètent l'écran de facturation, elles n'en sont pas la condition. Si
// leur chargement échoue, l'état d'abonnement et ses alertes restent debout —
// blanchir la page priverait le lecteur de ce qu'il vient justement y chercher.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Notice from '@/components/console/Notice.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import { ApiError } from '@/api'
import { getFactures, downloadFacturePdf } from '@/api/console'
import { euros } from '@/lib/euros'
import { explain, humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'
import { fmtDay } from '@/types/api'
import type { CommerceFacture } from '@/types/api.commerce'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  orgId: number
  /** L'org est-elle censée recevoir des factures ? (abonnement PAYANT en cours).
   *  Sert uniquement à choisir entre « aucune facture pour l'instant », qui
   *  rassure un abonné, et le silence, qui convient à qui n'a jamais rien réglé —
   *  y compris un abonnement offert, où rien n'est encaissé donc rien n'est
   *  facturé. Ne conditionne JAMAIS l'affichage des factures elles-mêmes. */
  paying?: boolean
}>()

const { toast } = useToast()

const invoices = ref<CommerceFacture[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
// « Cette org n'a pas de facturation chez nous » — distinct d'une panne. Le commerce
// rend `404 unknown_org` pour l'org d'un tenant tiers : c'est une absence de surface,
// pas un incident, et l'annoncer en rouge inquiéterait pour une fonctionnalité qui
// n'existe simplement pas ici.
const absente = ref(false)
const busy = ref<number | null>(null)

// On ne montre rien tant qu'on n'a rien à dire : le squelette de la vue couvre déjà
// l'attente, un second cadre vide qui apparaît puis disparaît ferait sautiller
// l'écran.
const visible = computed(() =>
  !loading.value && !absente.value
  && (invoices.value.length > 0 || !!error.value || !!props.paying))

async function load() {
  loading.value = true
  error.value = null
  try {
    invoices.value = (await getFactures(props.orgId)).factures
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) absente.value = true
    else error.value = humanize(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)

/** Ce qui NOMME la ligne. Un avoir se dit avoir : son montant est négatif, et le
 *  lire comme une facture ferait passer un remboursement pour un débit. Tout ce
 *  qui n'est pas explicitement un avoir est traité en facture — une `nature` inconnue
 *  reste un document dû, il ne disparaît pas. */
function estAvoir(inv: CommerceFacture): boolean {
  return inv.nature === 'credit_note'
}

/** La période couverte, quand elle est servie. Deux bornes ou rien : « du 1er
 *  septembre » sans fin ne dit pas ce qu'on a payé. */
function periode(inv: CommerceFacture): string | null {
  const d = fmtDay(inv.periode_debut)
  const f = fmtDay(inv.periode_fin)
  return d && f ? `du ${d} au ${f}` : null
}

/** La date que le document PORTE — pas encore émis, il n'en a pas. */
function date(inv: CommerceFacture): string {
  return fmtDay(inv.emise_le) ?? '—'
}

function montant(inv: CommerceFacture): string {
  return inv.montant_ttc == null ? '—' : euros(inv.montant_ttc)
}

/** Le nom de repli si le serveur n'a pas posé de Content-Disposition. Le numéro
 *  quand il existe, l'identifiant sinon : un `pending` n'a pas encore de numéro. */
function nomFichier(inv: CommerceFacture): string {
  if (inv.pdf_nom) return inv.pdf_nom
  const base = estAvoir(inv) ? 'avoir' : 'facture'
  return `${base}-${inv.numero ?? inv.id}.pdf`
}

async function telecharger(inv: CommerceFacture) {
  busy.value = inv.id
  try {
    await downloadFacturePdf(props.orgId, inv.id, nomFichier(inv))
  } catch (e) {
    // Le serveur rédige ses refus pour être lus (« le PDF de ce document n'a pas
    // encore été récupéré auprès du fournisseur — il le sera automatiquement ») :
    // on les affiche mot pour mot plutôt qu'une phrase générique.
    toast(explain(e))
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <ConsoleCard v-if="visible" :flush="invoices.length > 0 && !error" :title="t('billingUi.invoices.title')"
    :sub="t('billingUi.invoices.sub')">
    <Notice v-if="error" tone="warn">
      {{ error }}
      <Btn kind="link" icon="chev" class="notice-fix" @click="load">{{ t('common.retry') }}</Btn>
    </Notice>

    <table v-else-if="invoices.length" class="tbl">
      <thead>
        <tr>
          <th>{{ t('billingUi.invoices.date') }}</th><th>{{ t('billingUi.invoices.number') }}</th><th>{{ t('billingUi.invoices.period') }}</th>
          <th class="num">{{ t('billingUi.invoices.amount') }}</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="inv in invoices" :key="inv.id">
          <td class="mono">{{ date(inv) }}</td>
          <td>
            <span v-if="inv.numero" class="mono">{{ inv.numero }}</span>
            <!-- Pas encore de numéro : il n'existe pas avant le document. On le dit
                 sans jamais laisser entendre que l'argent s'est perdu. -->
            <Tag v-else tone="saffron">{{ t('billingUi.invoices.issuing') }}</Tag>
            <Tag v-if="estAvoir(inv)" tone="cobalt" class="kind">{{ t('billingUi.invoices.credit') }}</Tag>
          </td>
          <td class="dim">{{ periode(inv) ?? '—' }}</td>
          <td class="num">{{ montant(inv) }}</td>
          <td class="act">
            <Btn v-if="inv.pdf" kind="mini" icon="download"
              :disabled="busy === inv.id" @click="telecharger(inv)">{{ t('billingUi.invoices.pdf') }}</Btn>
            <!-- Émis, mais le fichier n'est pas encore revenu du fournisseur : la
                 reprise le récupérera. Dire l'attente vaut mieux qu'un bouton qui
                 refuserait au clic. -->
            <span v-else-if="inv.statut === 'issued'" class="soon">{{ t('billingUi.invoices.preparing') }}</span>
          </td>
        </tr>
      </tbody>
    </table>

    <p v-else class="empty">
      {{ t('billingUi.invoices.none') }}
    </p>
  </ConsoleCard>
</template>

<style scoped>
/* Repris à l'identique de l'écran de facturation : mêmes tons, mêmes espacements. */
.notice-fix {
  margin-left: 6px; color: inherit; text-decoration: underline; text-underline-offset: 2px;
}
.notice-fix:hover { color: inherit; opacity: 0.75; }
.empty { font-size: 12px; color: var(--color-mute); margin: 0; line-height: 1.5; }
.act { text-align: right; white-space: nowrap; }
.kind { margin-left: 6px; }
.soon { font-size: 11px; color: var(--color-faint); }
</style>

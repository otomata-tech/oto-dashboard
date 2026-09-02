<script setup lang="ts">
// Les factures de l'organisation — l'écran qui manquait à une promesse écrite.
//
// ⚠️ Les CGV publiées engagent Otomata mot pour mot : « Chaque encaissement donne
// lieu à une facture, envoyée par courrier électronique et **téléchargeable depuis
// manage.oto.cx** », et elle « reste téléchargeable au format PDF ». La liste et le
// PDF étaient servis en production depuis oto-backend #488 ; aucun écran ne les
// demandait. Un client payant ne pouvait donc récupérer aucune facture, alors que
// le contrat la lui promettait. Ce composant est cette porte, et rien d'autre.
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
//   3. **Aucun lien mort.** Le bouton n'existe que si le serveur a servi un
//      `pdf_path` — il ne le sert que s'il y a un fichier au bout. Un document émis
//      dont le PDF n'est pas encore récupéré le DIT, au lieu d'offrir un clic qui
//      tomberait sur une erreur.
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
import { getBillingInvoices, downloadBillingInvoicePdf } from '@/api/console'
import { euros } from '@/lib/euros'
import { explain, humanize } from '@/lib/errors'
import { useToast } from '@/composables/useToast'
import { fmtDay } from '@/types/api'
import type { BillingInvoice } from '@/types/api'

const props = defineProps<{
  /** L'org est-elle censée recevoir des factures ? (abonnement PAYANT en cours).
   *  Sert uniquement à choisir entre « aucune facture pour l'instant », qui
   *  rassure un abonné, et le silence, qui convient à qui n'a jamais rien réglé —
   *  y compris un abonnement offert, où rien n'est encaissé donc rien n'est
   *  facturé. Ne conditionne JAMAIS l'affichage des factures elles-mêmes. */
  paying?: boolean
}>()

const { toast } = useToast()

const invoices = ref<BillingInvoice[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
// « Ce déploiement n'a pas de facturation » — distinct d'une panne. Le serveur
// démonte la capacité quand le billing est dormant (dark launch, ADR 0043) : c'est
// une absence de surface, pas un incident, et l'annoncer en rouge inquiéterait pour
// une fonctionnalité qui n'existe simplement pas ici.
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
    invoices.value = (await getBillingInvoices()).invoices
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
 *  qui n'est pas explicitement un avoir est traité en facture — un `kind` inconnu
 *  reste un document dû, il ne disparaît pas. */
function estAvoir(inv: BillingInvoice): boolean {
  return inv.kind === 'credit_note'
}

/** La période couverte, quand elle est servie. Deux bornes ou rien : « du 1er
 *  septembre » sans fin ne dit pas ce qu'on a payé. */
function periode(inv: BillingInvoice): string | null {
  const d = fmtDay(inv.period_start)
  const f = fmtDay(inv.period_end)
  return d && f ? `du ${d} au ${f}` : null
}

/** La date du document : celle qu'il PORTE (l'encaissement), et seulement à défaut
 *  celle de sa ligne de suivi. */
function date(inv: BillingInvoice): string {
  return fmtDay(inv.issued_at) ?? fmtDay(inv.created_at) ?? '—'
}

function montant(inv: BillingInvoice): string {
  return inv.amount_ttc == null ? '—' : euros(inv.amount_ttc)
}

/** Le nom de repli si le serveur n'a pas posé de Content-Disposition. Le numéro
 *  quand il existe, l'identifiant sinon : un `pending` n'a pas encore de numéro. */
function nomFichier(inv: BillingInvoice): string {
  const base = estAvoir(inv) ? 'avoir' : 'facture'
  return `${base}-${inv.number ?? inv.id}.pdf`
}

async function telecharger(inv: BillingInvoice) {
  // Le chemin vient du serveur ; s'il est absent, il n'y a pas de bouton — cette
  // garde ne protège que d'un appel programmatique.
  if (!inv.pdf_path) return
  busy.value = inv.id
  try {
    await downloadBillingInvoicePdf(inv.pdf_path, nomFichier(inv))
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
  <ConsoleCard v-if="visible" :flush="invoices.length > 0 && !error" title="Factures"
    sub="chaque encaissement donne lieu à une facture — elle reste téléchargeable ici.">
    <Notice v-if="error" tone="warn">
      {{ error }}
      <Btn kind="link" icon="chev" class="notice-fix" @click="load">Réessayer</Btn>
    </Notice>

    <table v-else-if="invoices.length" class="tbl">
      <thead>
        <tr>
          <th>Date</th><th>Numéro</th><th>Période</th>
          <th class="num">Montant TTC</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="inv in invoices" :key="inv.id">
          <td class="mono">{{ date(inv) }}</td>
          <td>
            <span v-if="inv.number" class="mono">{{ inv.number }}</span>
            <!-- Pas encore de numéro : il n'existe pas avant le document. On le dit
                 sans jamais laisser entendre que l'argent s'est perdu. -->
            <Tag v-else tone="saffron">en cours d'émission</Tag>
            <Tag v-if="estAvoir(inv)" tone="cobalt" class="kind">avoir</Tag>
          </td>
          <td class="dim">{{ periode(inv) ?? '—' }}</td>
          <td class="num">{{ montant(inv) }}</td>
          <td class="act">
            <Btn v-if="inv.pdf_path" kind="mini" icon="download"
              :disabled="busy === inv.id" @click="telecharger(inv)">PDF</Btn>
            <!-- Émis, mais le fichier n'est pas encore revenu du fournisseur : la
                 reprise le récupérera. Dire l'attente vaut mieux qu'un bouton qui
                 refuserait au clic. -->
            <span v-else-if="inv.status === 'issued'" class="soon">PDF en préparation</span>
          </td>
        </tr>
      </tbody>
    </table>

    <p v-else class="empty">
      Aucune facture pour l'instant. La première paraîtra ici dès le prochain
      encaissement, et vous la recevrez aussi par courrier électronique.
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

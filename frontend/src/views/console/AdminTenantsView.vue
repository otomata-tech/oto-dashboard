<script setup lang="ts">
// Suivi des tenants (étage d'identité, ADR 0052) — projection PLATEFORME.
//
// Un tenant = un émetteur dédié (son Logto), des hosts, des orgs, des comptes. Il
// existait en base et dans le registre d'émetteurs du backend, mais sur AUCUN écran :
// savoir qui est servi, sous quelle configuration et avec quelle empreinte demandait
// un `psql` sur la base partagée.
//
// ⚠️ **Lecture seule, et ce n'est pas un manque.** Déclarer un tenant est un runbook
// de provisioning (instance Logto dédiée + client OAuth + hosts sur le proxy) et le
// registre backend est construit AU BOOT : un formulaire ici laisserait croire qu'une
// ligne en base suffit. D'où, à la place, le verdict `pending_restart` — déclaré mais
// pas chargé, donc ses jetons sont encore rejetés. **La seule écriture est le bouton
// « Recharger le registre »** (super_admin, 23/08) : il n'écrit rien en base, il fait
// relire les déclarations au process — c'est la moitié « prise d'effet » du runbook,
// et ce qui éteint le verdict sans fenêtre de redémarrage.
//
// ⚠️ Les colonnes « orgs » et « comptes » viennent de DEUX sources indépendantes
// (`orgs.tenant_id` d'un côté, la qualification du sub de l'autre) que rien ne tient
// ensemble : `orgs_desalignees` mesure leur écart, et la fiche en donne l'adresse.
import { computed, onMounted, ref } from 'vue'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import ConsoleTable from '@/components/console/ConsoleTable.vue'
import Stat from '@/components/console/Stat.vue'
import Tag from '@/components/console/Tag.vue'
import Btn from '@/components/console/Btn.vue'
import Icon from '@/components/console/Icon.vue'
import StateError from '@/components/console/StateError.vue'
import CopyField from '@/components/console/CopyField.vue'
import { useDeepLink } from '@/composables/useDeepLink'
import { getAdminTenants, getAdminTenant, reloadTenantRegistry } from '@/api/console'
import { useMe, isSuperAdmin } from '@/composables/useMe'
import type { TenantRow, TenantSheet, TenantTotals } from '@/types/api'
import { fmtDate, fmtDateTime } from '@/types/api'
import { tenantVerdict as verdict, needsAttention } from '@/lib/tenantVerdict'
import { humanize } from '@/lib/errors'

const WINDOWS = [7, 30, 90]
const win = ref(30)
const tenants = ref<TenantRow[]>([])
const totals = ref<TenantTotals | null>(null)
const loaded = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)

const sheet = ref<TenantSheet | null>(null)
const sheetLoading = ref(false)
const sheetError = ref<string | null>(null)

// Deep-link : la fenêtre ET le tenant ouvert vivent dans l'URL (partageable, survit
// au refresh) — même patron que /platform/monitoring.
const dlWin = useDeepLink('win', (w) => {
  if (w != null && WINDOWS.includes(w) && w !== win.value) { win.value = w; void load() }
}, { parse: Number })
const wInit = dlWin.read(); if (wInit != null && WINDOWS.includes(wInit)) win.value = wInit
const dlTenant = useDeepLink('tenant', (slug) => { void openSheet(slug, false) })

const alertes = computed(() => tenants.value.filter(needsAttention))

async function load() {
  loading.value = true
  error.value = null
  const w = win.value
  try {
    const res = await getAdminTenants(w)
    if (w !== win.value) return          // fenêtre changée entre-temps : réponse périmée
    tenants.value = res.tenants
    totals.value = res.totals
    loaded.value = true
  } catch (e) { if (w === win.value) error.value = humanize(e) }
  finally { if (w === win.value) loading.value = false }
}

async function openSheet(slug: string | null, writeUrl = true) {
  if (writeUrl) dlTenant.set(slug)
  if (!slug) { sheet.value = null; sheetError.value = null; return }
  sheetLoading.value = true
  sheetError.value = null
  try { sheet.value = (await getAdminTenant(slug, win.value)).tenant }
  catch (e) { sheet.value = null; sheetError.value = humanize(e) }
  finally { sheetLoading.value = false }
}

function toggle(t: TenantRow) {
  void openSheet(sheet.value?.slug === t.slug ? null : t.slug)
}

function setWin(w: number) {
  if (w === win.value) return
  win.value = w
  dlWin.set(w)
  void load()
  if (sheet.value) void openSheet(sheet.value.slug, false)
}

// ── reload du registre (super_admin) — la moitié « prise d'effet » du runbook ──
// Le backend relit la table `tenants` et swappe le registre d'émetteurs du process
// à chaud : c'est ce qui éteint le verdict « redémarrage requis ». Aucune écriture
// en base — le provisionnement lui-même reste un runbook.
const { me } = useMe()
const canReload = computed(() => isSuperAdmin(me.value))
const reloading = ref(false)
const reloadError = ref<string | null>(null)

async function reload() {
  reloading.value = true
  reloadError.value = null
  try {
    await reloadTenantRegistry()
    await load()
    if (sheet.value) await openSheet(sheet.value.slug, false)
  } catch (e) { reloadError.value = humanize(e) }
  finally { reloading.value = false }
}

onMounted(async () => {
  await load()
  const s = dlTenant.read()
  if (s) void openSheet(s, false)
})

</script>

<template>
  <div class="content-inner fadein">
    <StateError v-if="error && !loaded" :message="error" @retry="load" />

    <template v-else>
      <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

      <div class="grid4">
        <Stat label="tenants" :value="totals?.tenants ?? '—'" sub="étages d'identité déclarés" />
        <Stat label="organisations" :value="totals?.orgs ?? '—'" sub="rattachées à un tenant" />
        <Stat label="comptes" :value="totals?.comptes ?? '—'" sub="qualifiés par leur émetteur" />
        <Stat label="comptes actifs" :value="totals?.comptes_actifs ?? '—'"
          :sub="`ont appelé un outil sur ${win} j`" />
      </div>

      <!-- Ce qui demande une action : un tenant déclaré mais pas chargé (ses jetons
           sont rejetés), ou un écart entre les deux rattachements. -->
      <ConsoleCard v-if="alertes.length" title="à regarder"
        sub="un tenant déclaré n'est servi que lorsque le serveur a rechargé son registre d'émetteurs ; un écart de rattachement ne se répare pas tout seul.">
        <template v-if="canReload" #actions>
          <Btn kind="mini" icon="refresh" :disabled="reloading" @click="reload"
            title="fait relire les déclarations au serveur, sans redémarrage — c'est ce qui fait passer les jetons d'un tenant déclaré">
            {{ reloading ? 'Rechargement…' : 'Recharger le registre' }}
          </Btn>
        </template>
        <p v-if="reloadError" class="helptext" style="color: var(--color-terra-ink)">
          {{ reloadError }}
        </p>
        <div class="rowlist">
          <div v-for="t in alertes" :key="t.slug" class="rowitem">
            <div style="display: flex; align-items: center; gap: 9px; min-width: 0">
              <Icon name="warn" :size="15" style="color: var(--color-terra-ink); flex-shrink: 0" />
              <div style="min-width: 0">
                <div><strong>{{ t.name }}</strong> <code class="mono dim">{{ t.slug }}</code></div>
                <div class="helptext">
                  <template v-if="t.pending_restart">{{ verdict(t).why }}</template>
                  <template v-else>
                    {{ t.orgs_desalignees }} organisation(s) rattachée(s) à ce tenant ont été créées
                    par un compte relevant d'un autre — le rattachement d'org et l'identité ne disent
                    pas la même chose.
                  </template>
                </div>
              </div>
            </div>
            <Btn kind="mini" icon="chev" @click="openSheet(t.slug)">Ouvrir</Btn>
          </div>
        </div>
      </ConsoleCard>

      <ConsoleCard flush title="tenants"
        sub="qui est servi, sous quel émetteur, avec quelle empreinte. lecture seule : déclarer un tenant est une opération de provisionnement (instance d'annuaire dédiée), pas un formulaire.">
        <template #actions>
          <div class="seg">
            <button v-for="w in WINDOWS" :key="w" :class="{ on: win === w }" @click="setWin(w)">
              {{ w }} j
            </button>
          </div>
          <Btn kind="mini" icon="refresh" :disabled="loading" @click="load">
            {{ loading ? 'Chargement…' : 'Rafraîchir' }}
          </Btn>
        </template>

        <ConsoleTable :rows="tenants" :busy="loading" :loaded="loaded"
          empty="aucun tenant déclaré — toute la plateforme vit sur le tenant oto.">
          <template #head>
            <th>tenant</th>
            <th>état</th>
            <th>émetteur</th>
            <th class="num">orgs</th>
            <th class="num">comptes</th>
            <th class="num">actifs</th>
            <th class="num">appels</th>
            <th>dernier appel</th>
          </template>
          <template #row="{ row: t }">
            <tr class="crow" :class="{ sel: sheet?.slug === t.slug }" @click="toggle(t)">
              <td>
                <div style="font-weight: 600">{{ t.name }}</div>
                <code class="mono dim">{{ t.slug }}</code>
              </td>
              <td>
                <Tag :tone="verdict(t).tone">{{ verdict(t).label }}</Tag>
                <Tag v-if="t.orgs_desalignees" tone="terra" style="margin-left: 6px">
                  {{ t.orgs_desalignees }} écart(s)
                </Tag>
              </td>
              <td class="dim">
                <code v-if="t.issuer" class="mono">{{ t.issuer }}</code>
                <span v-else-if="t.primary">configuration du serveur</span>
                <span v-else>—</span>
              </td>
              <td class="num">{{ t.orgs }}</td>
              <td class="num">{{ t.comptes }}</td>
              <td class="num">{{ t.comptes_actifs }}</td>
              <td class="num">{{ t.appels }}</td>
              <td class="dim">{{ fmtDateTime(t.last_seen_at) ?? 'jamais' }}</td>
            </tr>
          </template>
        </ConsoleTable>
      </ConsoleCard>

      <!-- Fiche du tenant sélectionné : ce qui explique les compteurs de sa ligne. -->
      <p v-if="sheetError" class="helptext" style="color: var(--color-terra-ink)">{{ sheetError }}</p>
      <!-- Première ouverture : rien à remplacer encore, donc le squelette est la seule
           preuve que le clic a été pris. -->
      <div v-if="sheetLoading && !sheet" class="sk-card" />
      <template v-if="sheet">
        <ConsoleCard :title="`${sheet.name} — configuration`"
          :sub="verdict(sheet).why">
          <template #actions>
            <Btn kind="mini" icon="close" @click="openSheet(null)">Fermer</Btn>
          </template>
          <div class="card-body">
            <div v-if="sheetLoading" class="sk-card" />
            <div v-else class="grid2">
              <div class="copystack">
                <div class="eyebrow">annuaire</div>
                <CopyField v-if="sheet.issuer" label="émetteur" :value="sheet.issuer" />
                <p v-else class="helptext">
                  émetteur porté par la configuration du serveur ({{ sheet.primary ? 'tenant de la plateforme' : 'non déclaré' }}).
                </p>
                <CopyField v-if="sheet.jwks_uri" label="clés (jwks)" :value="sheet.jwks_uri" />
                <CopyField v-if="sheet.oauth_client_id" label="client oauth" :value="sheet.oauth_client_id" />
                <p class="helptext">
                  le client oauth est celui de l'annuaire VISÉ : c'est lui que la façade
                  d'enregistrement rend sur les domaines de ce tenant.
                </p>
              </div>
              <div class="copystack">
                <div class="eyebrow">domaines &amp; renvois</div>
                <p class="helptext" v-if="!sheet.hosts.length">
                  aucun domaine déclaré — la découverte de ce tenant n'est liée à aucun host.
                </p>
                <p v-else>
                  <Tag v-for="h in sheet.hosts" :key="h" tone="cobalt" style="margin-right: 6px">{{ h }}</Tag>
                </p>
                <p v-if="sheet.hosts.length && !sheet.live_hosts.length" class="helptext"
                  style="color: var(--color-terra-ink)">
                  déclarés mais non servis par le serveur en cours : un redémarrage est nécessaire.
                </p>
                <CopyField v-if="sheet.dashboard_url" label="tableau de bord" :value="sheet.dashboard_url" />
                <p class="helptext">
                  chemins d'écran :
                  <template v-if="Object.keys(sheet.link_paths).length">
                    {{ Object.keys(sheet.link_paths).join(', ') }} — les types absents n'ont
                    pas d'équivalent chez ce partenaire, donc aucun lien n'est rendu.
                  </template>
                  <template v-else>aucun — nos chemins ne sont jamais collés sous son domaine.</template>
                </p>
              </div>
            </div>
          </div>
        </ConsoleCard>

        <ConsoleCard v-if="sheet.orgs_desalignees_detail.length" flush
          title="rattachements à trancher"
          sub="ces organisations sont rattachées à ce tenant alors que leur créateur relève d'un autre — l'état que laisse une bascule partielle. le suivi les nomme ; il ne les déplace pas.">
          <ConsoleTable :rows="sheet.orgs_desalignees_detail" empty="aucun écart.">
            <template #head>
              <th>organisation</th><th>créée par</th><th>tenant du créateur</th>
            </template>
            <template #row="{ row: o }">
              <tr>
                <td>{{ o.name }} <code class="mono dim">#{{ o.id }}</code></td>
                <td class="mono dim">{{ o.created_by ?? '—' }}</td>
                <td><Tag tone="terra">{{ o.tenant_du_createur }}</Tag></td>
              </tr>
            </template>
          </ConsoleTable>
        </ConsoleCard>

        <div class="grid2">
          <ConsoleCard flush title="organisations"
            :sub="`rattachées à ${sheet.slug} (50 plus récentes) — ${sheet.orgs} active(s), ${sheet.orgs_archivees} archivée(s).`">
            <ConsoleTable :rows="sheet.orgs_recentes" empty="aucune organisation sur ce tenant.">
              <template #head>
                <th>org</th><th class="num">membres</th><th>créée</th>
              </template>
              <template #row="{ row: o }">
                <tr>
                  <td>
                    {{ o.name }}
                    <Tag v-if="o.personal" tone="cobalt" style="margin-left: 6px">perso</Tag>
                    <Tag v-if="o.archived_at" tone="saffron" style="margin-left: 6px">archivée</Tag>
                    <div v-if="o.front_brand" class="helptext">front : {{ o.front_brand }}</div>
                  </td>
                  <td class="num">{{ o.membres }}</td>
                  <td class="dim">{{ fmtDate(o.created_at) ?? '—' }}</td>
                </tr>
              </template>
            </ConsoleTable>
          </ConsoleCard>

          <ConsoleCard flush title="comptes"
            :sub="`identifiés par leur émetteur (50 premiers, les plus actifs d'abord) — ${sheet.comptes_actifs}/${sheet.comptes} actifs sur ${win} j.`">
            <ConsoleTable :rows="sheet.comptes_recents" empty="aucun compte sur ce tenant.">
              <template #head>
                <th>compte</th><th class="num">appels</th><th>vu</th>
              </template>
              <template #row="{ row: c }">
                <tr>
                  <td>
                    <div>{{ c.email ?? c.name ?? '—' }}</div>
                    <code class="mono dim">{{ c.sub }}</code>
                  </td>
                  <td class="num">{{ c.appels }}</td>
                  <td class="dim">{{ fmtDateTime(c.last_seen_at) ?? 'jamais' }}</td>
                </tr>
              </template>
            </ConsoleTable>
          </ConsoleCard>
        </div>
      </template>
    </template>
  </div>
</template>

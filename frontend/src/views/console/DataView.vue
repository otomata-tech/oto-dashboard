<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Btn from '@/components/console/Btn.vue'
import Tag from '@/components/console/Tag.vue'
import Icon from '@/components/console/Icon.vue'
import DatastoreTable from '@/components/console/DatastoreTable.vue'
import NamespaceCreateDialog from '@/components/console/NamespaceCreateDialog.vue'
import { useToast } from '@/composables/useToast'
import { useMe } from '@/composables/useMe'
import { getNamespaces, createNamespace } from '@/api/console'
import type { DatastoreEntry } from '@/types/api'
import { humanize } from '@/lib/errors'

const { toast } = useToast()
const { me } = useMe()
const route = useRoute()
const router = useRouter()

const datastores = ref<DatastoreEntry[]>([])
const error = ref<string | null>(null)
const loaded = ref(false)
const selectedId = ref<number | null>(null)
const createOpen = ref(false)

const current = computed(() => datastores.value.find((n) => n.id === selectedId.value) || null)
const activeOrgName = computed(() => (me.value?.active_org ? (me.value?.active_org_name || 'mon org') : null))

// Hors organisation : aucune org active, OU l'espace personnel mono-membre, que le produit
// présente déjà comme « solo » plutôt que comme une org (`active_org_is_personal`,
// principe 9). Il n'y a alors aucun contexte d'org à protéger — le personnel est tout ce
// qu'il y a à montrer, et un tableau créé par un agent naît personnel (ADR 0068) : replié
// là, un utilisateur seul trouverait toutes ses tables derrière un clic. Décision d'Alexis
// du 10/09 (oto#160) : section personnelle dépliée hors org, repliée dans une org.
//
// ⚠️ Sans org active, `GET /api/datastores` ne sert aujourd'hui AUCUNE ligne
// (`active_owner(None)`) : c'est par l'espace personnel que cette règle se voit.
const horsOrg = computed(() => !me.value?.active_org || !!me.value?.active_org_is_personal)

// L'org active ne possède AUCUN tableau, et pourtant la liste n'est pas vide : elle ne
// montre alors que du personnel et du reçu-en-partage. C'est la lecture qui a trompé le
// 10/09 (otomata-tech/oto#160) — dix lignes prises pour celles du client, parce que rien
// ne disait que le principal était vide. Rend le NOM de l'org quand il faut le dire,
// `null` sinon : c'est ce nom qu'on croyait lire, lui seul ferme le malentendu.
//
// `group` compte comme « l'org en a » — une table d'équipe vit dans l'org, la phrase
// serait fausse. Un tableau REÇU en partage n'est possédé par personne d'ici, il ne
// compte pas. Et sans nom servi on se tait : « aucun tableau dans mon org » n'apprend
// rien à qui doutait justement de quelle org il regardait. Hors org — l'espace personnel
// compris, qui a pourtant un nom servi — il n'y a pas d'org à nommer : on se tait.
const orgSansTableau = computed(() => {
  const nom = horsOrg.value ? null : me.value?.active_org_name
  if (!nom || !datastores.value.length) return null
  const aLesSiens = datastores.value.some(
    (n) => !n.shared && (n.owner_type === 'org' || n.owner_type === 'group'))
  return aLesSiens ? null : nom
})

// Arbitrage d'Alexis du 10/09 (otomata-tech/oto#160) : le personnel n'est PAS filtré par
// org — 156 appels sur 8 tableaux se font depuis une autre org que celle du propriétaire,
// le filtrer ferait disparaître ce qu'on utilise. Il est RANGÉ À PART : les tableaux de
// l'org (possédés par elle, par une de ses équipes, ou partagés à elles) se lisent seuls
// en tête, le personnel suit dans sa propre section, repliée dans une org (dépliée hors
// org, cf. `horsOrg`). Le contexte de l'org ne se mêle plus au personnel, et le personnel
// reste à un clic.
//
// Une section repliée qui ne dirait rien recréerait l'absence qu'on répare : son en-tête
// porte le libellé (le mot du badge, `personnel`) ET le nombre. Des données plutôt qu'un
// second bloc de gabarit : une autre section se pose en ajoutant une entrée.
const deLorg = computed(() => datastores.value.filter((n) => !n.is_personal))
const personnels = computed(() => datastores.value.filter((n) => n.is_personal))
const groupes = computed(() => [
  { cle: 'org', libelle: null, lignes: deLorg.value, replieParDefaut: false },
  { cle: 'perso', libelle: 'personnel', lignes: personnels.value, replieParDefaut: !horsOrg.value },
].filter((g) => g.lignes.length))
// Le geste de l'utilisateur prime sur le défaut : `ouvert` ne retient que ce qu'il a fait.
const ouvert = ref<Record<string, boolean>>({})
const estOuvert = (g: { cle: string; replieParDefaut: boolean }) =>
  ouvert.value[g.cle] ?? !g.replieParDefaut
// Un tableau sélectionné dans une section repliée (lien direct, création « personnel »)
// l'ouvre : sinon la ligne active serait cachée derrière le repli qu'on vient de poser.
watch(current, (c) => {
  const g = groupes.value.find((x) => x.libelle && x.lignes.some((n) => n.id === c?.id))
  if (g) ouvert.value[g.cle] = true
})

// La phrase décrit la disposition qu'on VOIT. Elle disait « ceux ci-dessous sont
// personnels ou partagés avec toi » : vrai d'une liste mêlée, faux depuis que le
// personnel est rangé à part et replié — sous elle il n'y a plus de lignes personnelles,
// il y a un en-tête qui les compte. Elle nomme donc ce qui est réellement là : le partagé
// dans la liste de l'org, le personnel dans sa section. Mêmes silences qu'avant
// (`orgSansTableau`) : org qui possède, équipe qui possède, hors org (espace perso
// compris), sans nom, liste vide.
const contexte = computed(() => {
  const nom = orgSansTableau.value
  if (!nom) return null
  const suite = !deLorg.value.length
    ? 'tes tableaux personnels sont rangés à part, ci-dessous'
    : personnels.value.length
      ? 'ceux ci-dessous sont partagés avec toi, pas les siens ; tes tableaux personnels sont rangés à part'
      : 'ceux ci-dessous sont partagés avec toi, pas les siens'
  return `aucun tableau dans ${nom} — ${suite}.`
})

// Sélection pilotée par le CHEMIN `/data/:id` (id stable au renommage, ADR 0032) —
// résolu par id OU nom (les liens agent portent le nom) ; l'ancien `?ns=` est normalisé.
const selParam = computed(() => {
  const p = route.params.id
  if (typeof p === 'string' && p) return p
  const q = route.query.ns
  return typeof q === 'string' && q ? q : null
})
async function applySelection(raw: string | null) {
  if (!raw) { selectedId.value = null; return }
  const ns = datastores.value.find((n) => String(n.id) === raw || n.datastore === raw)
  if (!ns) { selectedId.value = null; return }
  if (String(route.params.id) !== String(ns.id)) {
    const { ns: _drop, ...rest } = route.query
    // préserve le deep-link de row (`…/item/<rowId>`) quand on normalise nom → id
    const item = typeof route.params.rowId === 'string' && route.params.rowId
      ? `/item/${route.params.rowId}` : ''
    void router.replace({ path: `/data/${ns.id}${item}`, query: rest })
  }
  selectedId.value = ns.id
}
watch(selParam, (v) => { void applySelection(v) })

// Un `/data/:id` qui ne résout rien rendait EXACTEMENT le même écran que « rien de
// sélectionné » : `applySelection` jette l'id (ligne ci-dessus) et on retombe sur
// « pick a datastore ». Le destinataire d'un lien direct légitime lisait donc une
// invitation à choisir, jamais une cause — et concluait que le tableau n'existait pas
// (vécu en clientèle le 10/09, otomata-tech/oto#160 · #154). Le message qui l'explique
// existe bien, mais dans `DatastoreTable`, monté seulement quand le tableau est DÉJÀ
// résolu : inatteignable depuis ici par construction. On pose donc la branche ici.
// `!error` : une liste qui n'a pas chargé n'est pas un tableau introuvable — sans ce
// garde, une panne de réseau accuserait le partage.
const introuvable = computed(
  () => loaded.value && !error.value && !!selParam.value && !current.value)

async function load() {
  try { datastores.value = (await getNamespaces()).datastores }
  catch (e) { error.value = humanize(e) }
  finally { loaded.value = true }
}
onMounted(async () => {
  await load()
  await applySelection(selParam.value)
})

function open(id: number) { void router.push(`/data/${id}`) }

async function doCreate(payload: { name: string; scope: 'user' | 'org' }) {
  const activeOrg = me.value?.active_org
  const owner = payload.scope === 'org' && activeOrg ? { type: 'org', id: activeOrg } : undefined
  try {
    await createNamespace(payload.name, owner)
    toast(`datastore "${payload.name}" created`)
    await load()
    const created = datastores.value.find((n) => n.datastore === payload.name)
    if (created) open(created.id)
  } catch (e) { toast(humanize(e)); throw e }
}

async function onNsDeleted() {
  selectedId.value = null
  void router.replace('/data')
  await load()
}
</script>

<template>
  <div class="content-inner fadein">
    <p v-if="error" class="helptext" style="color: var(--color-terra-ink)">{{ error }}</p>

    <div class="data-layout">
      <!-- liste des tableaux -->
      <ConsoleCard title="datastores" flush
        sub="tabular storage your agents read &amp; write through data_* tools.">
        <template #actions>
          <Btn kind="mini" icon="plus" @click="createOpen = true">new</Btn>
        </template>
        <!-- Ce qui manquait le 10/09 n'était pas « à qui sont ces tableaux » — les badges
             le disent — mais POURQUOI la liste ressemble à ça. On dit l'absence d'abord,
             puis ce qui est montré à la place. Muette dès qu'elle n'apprend rien : une org
             qui possède des tableaux n'a pas à s'entendre dire qu'elle en a. -->
        <p v-if="contexte" class="helptext ns-context">{{ contexte }}</p>
        <div class="rowlist">
          <template v-for="g in groupes" :key="g.cle">
            <!-- En-tête de section : libellé + nombre, lisibles REPLIÉS — replié n'est pas caché. -->
            <button v-if="g.libelle" type="button" class="ns-fold"
              :aria-expanded="estOuvert(g)" :aria-controls="`ns-groupe-${g.cle}`"
              @click="ouvert[g.cle] = !estOuvert(g)">
              <Icon :name="estOuvert(g) ? 'chevron-down' : 'chevron-right'" :size="12" />
              <span class="ns-fold-label">{{ g.libelle }}</span>
              <span class="ns-fold-count">{{ g.lignes.length }}</span>
            </button>
            <div v-show="estOuvert(g)" :id="`ns-groupe-${g.cle}`" class="ns-groupe">
              <button v-for="ns in g.lignes" :key="ns.id"
                class="rowitem ns-item" :class="{ active: ns.id === selectedId }"
                @click="open(ns.id)">
                <code class="mono" style="font-weight: 600">{{ ns.datastore }}</code>
                <!-- UN groupe calé à droite, et l'appartenance EN DERNIER : les badges étaient
                     des enfants directs d'un `space-between`, donc répartis — l'appartenance
                     se décalait vers le milieu sur les seules lignes portant aussi `typé`, et
                     la colonne zigzaguait. On répare la liste dont on est en train de réparer
                     la crédibilité. Dernier = bord droit stable : c'est le signal qu'on scanne.
                     `typé` (état du schéma, olive) n'est pas sur le même axe et flotte devant.

                     Un tableau PERSONNEL, lui, ne portait AUCUNE marque : sans badge il se
                     lisait comme « le cas normal, celui de l'org où je suis » — l'inverse de la
                     vérité, et la confusion du 10/09 (otomata-tech/oto#160). Le mot est celui du
                     sélecteur de propriétaire à la création (« personnel (moi seul) »), pas un
                     registre neuf. `is_personal` est servi ET requis par GET /api/datastores :
                     owner_type='user' ET owner_id=mon sub — un tableau d'un AUTRE utilisateur
                     reçu par partage reste donc sur la branche `shared`. -->
                <span class="ns-tags">
                  <Tag v-if="ns.schema?.fields?.length" tone="olive">typé</Tag>
                  <Tag v-if="ns.owner_type === 'org'" tone="cobalt">org</Tag>
                  <Tag v-else-if="ns.owner_type === 'group'" tone="cobalt">team</Tag>
                  <Tag v-else-if="ns.shared" tone="cobalt">shared · {{ ns.permission || 'read' }}</Tag>
                  <Tag v-else-if="ns.is_personal" tone="cobalt">personnel</Tag>
                </span>
              </button>
            </div>
          </template>
          <div v-if="loaded && !datastores.length" class="dim" style="text-align: center; padding: 16px">
            no datastores yet — create one to let your agents store rows.
          </div>
        </div>
      </ConsoleCard>

      <!-- contenu du tableau sélectionné (composant réutilisable) -->
      <DatastoreTable v-if="current" :ns-ref="String(selectedId)" :ns-meta="current"
        @changed="load" @deleted="onNsDeleted" />
      <!-- On nomme la cause la PLUS probable en premier, parce que c'est celle qui ne se
           devine pas : un partage nominatif (`data_share` vers une adresse) ouvre bien la
           lecture et l'écriture, mais n'entre dans aucune liste — atteignable et
           introuvable. Et le remède est adressé à qui peut l'appliquer : le destinataire
           ne peut ni se re-partager le tableau ni s'en transférer la propriété, il ne
           peut que le demander. Lui prescrire un geste qu'il n'a pas serait le renvoyer
           dans le même mur. -->
      <ConsoleCard v-else-if="introuvable" title="tableau introuvable ici">
        <div class="helptext">
          ce tableau n'apparaît pas dans le contexte où tu es. il t'a peut-être été partagé
          <strong>nominativement</strong> — un partage à une personne ouvre l'accès mais
          n'entre dans aucune liste ; il peut aussi appartenir à une autre organisation, ou
          avoir été supprimé. demande à son propriétaire de le partager à ton organisation
          ou à ton équipe, ou de t'en transférer la propriété.
        </div>
      </ConsoleCard>
      <ConsoleCard v-else title="pick a datastore">
        <div class="helptext">select a datastore on the left to view its rows.</div>
      </ConsoleCard>
    </div>

    <ConsoleCard title="how agents use this">
      <div class="helptext" style="font-size: 12.5px; line-height: 1.65; margin-bottom: 10px">
        schema-free tables your agents read and write in plain language — no columns to define
        upfront, new fields just appear as they're written.
      </div>
      <dl class="ds-verbs">
        <div>
          <dt>write</dt>
          <dd><code>data_write(ns, row)</code> appends a row · pass an <code>id</code> to update
            only the fields you give · new keys auto-create their columns.</dd>
        </div>
        <div>
          <dt>read</dt>
          <dd><code>data_rows(ns, filter)</code> lists rows (exact-match filter + limit), or fetches
            one by <code>id</code>.</dd>
        </div>
        <div>
          <dt>organize</dt>
          <dd><code>data_create_datastore</code> / <code>data_list_datastores</code> manage tables ·
            <code>data_set_schema</code> turns a flat table into typed cards.</dd>
        </div>
        <div>
          <dt>share</dt>
          <dd><code>data_share(ns, email, read|write)</code> gives a teammate access under their own
            account · <code>data_delete_row</code> / <code>data_delete_datastore</code> clean up.</dd>
        </div>
        <div>
          <dt>see it</dt>
          <dd><code>data_app</code> renders a sortable table right in the chat ·
            <code>data_url</code> links back to this page.</dd>
        </div>
      </dl>
    </ConsoleCard>

    <NamespaceCreateDialog v-model:open="createOpen" :org-name="activeOrgName" :on-confirm="doCreate" />
  </div>
</template>

<style scoped>
.data-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: var(--gap, 16px);
  align-items: start;
}
.ds-verbs { display: flex; flex-direction: column; gap: 8px; margin: 0; }
.ds-verbs > div { display: grid; grid-template-columns: 84px 1fr; gap: 12px; align-items: baseline; }
.ds-verbs dt { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--color-ink-soft, #6b6b6b); }
.ds-verbs dd { margin: 0; font-size: 12.5px; line-height: 1.6; color: var(--color-ink-soft, #6b6b6b); }
.ds-verbs code { font-size: 11px; }
@media (max-width: 560px) {
  .ds-verbs > div { grid-template-columns: 1fr; gap: 2px; }
}
@media (max-width: 720px) {
  .data-layout { grid-template-columns: 1fr; }
}
.ns-context { padding-inline: var(--pad-card); padding-bottom: 8px; margin: 0; }
/* `margin-left: auto` sur le GROUPE, jamais `space-between` sur la ligne : réparti,
   le nombre de badges déplaçait celui qu'on scanne. `flex: none` pour qu'un nom long
   pousse la ligne sans écraser les badges. */
.ns-tags { margin-left: auto; flex: none; display: flex; align-items: center; gap: 8px; }
/* En-tête de section : il ne doit pas se lire comme une ligne (pas de nom en mono gras)
   et reprend la micro-typo des badges — `PERSONNEL` en tête fait écho au badge des lignes
   qu'il range. Le filet du haut le détache de la liste de l'org. */
.ns-fold {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: var(--row-py) var(--pad-card);
  border: 0;
  border-top: 1px solid var(--color-hair);
  background: none;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--color-mute);
}
.ns-fold:hover { color: var(--color-ink-soft); background: var(--color-paper-2); }
.ns-fold[aria-expanded="true"] { border-bottom: 1px solid var(--color-hair-soft); }
.ns-fold-count { color: var(--color-faint); font-weight: 600; }
.ns-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-inline: var(--pad-card);
  background: none;
  border: 0;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.ns-item.active { background: var(--color-paper-3); }
</style>

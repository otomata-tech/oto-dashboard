<script setup lang="ts">
// Qui recevra le message, et dans quelle langue — la liste servie EST l'audience.
//
// ⚠️ **`locale` et `served_locale` ne se confondent pas.** `locale_source='declared'`
// veut dire que la PERSONNE a choisi sa langue ; `'default'` veut dire que
// l'opérateur a choisi pour elle. Les afficher pareil ferait passer un choix
// d'interface pour une donnée de compte — et c'est précisément ce que le serveur
// refuse de deviner : il ne déduit RIEN du domaine de l'adresse, parce qu'un `.com`
// peut être français et un `.fr` une filiale. Le domaine est servi comme indication
// à l'œil, il n'entre dans aucune décision.
//
// ⚠️ `previous_outreach` compte les relances DÉJÀ reçues, toutes campagnes
// confondues. Il n'empêche rien par lui-même — c'est l'index unique
// `(campagne, compte)` du serveur qui interdit le doublon — mais il dit à
// l'opérateur qu'il s'apprête à écrire une deuxième fois à quelqu'un.
//
// ⚠️ **Une ligne = une BOÎTE MAIL, pas un compte.** Un humain peut s'être inscrit
// deux fois avec la même adresse ; le serveur fusionne alors ses comptes en une
// ligne, faute de quoi il recevrait deux fois le même message dans la même boîte.
// `accounts > 1` le DIT à l'écran : une fusion silencieuse ferait lire une audience
// rétrécie comme un filtre qui a trop mordu.
import ConsoleCard from '@/components/console/ConsoleCard.vue'
import Tag from '@/components/console/Tag.vue'
import Notice from '@/components/console/Notice.vue'
import Stat from '@/components/console/Stat.vue'
import { fmtDay } from '@/types/api'
import { countByLocale } from '@/lib/outreach'
import type { OutreachRow } from '@/types/api'

const props = defineProps<{
  rows: OutreachRow[]
  total: number
  selected: number
  truncated: boolean
  withDeclared: number
  withDefault: number
  /** Rendu seulement après un envoi : chaque ligne porte alors son sort. */
  showOutcome?: boolean
}>()

function parLangue(): string {
  const n = countByLocale(props.rows)
  return Object.keys(n).sort().map((lg) => `${n[lg]} en ${lg}`).join(', ')
}
</script>

<template>
  <ConsoleCard flush title="Destinataires"
    :sub="rows.length ? `la liste servie EST l'audience — ${parLangue()}.`
      : 'personne dans ce segment.'">
    <template #actions>
      <Tag v-if="truncated" tone="saffron">liste tronquée</Tag>
    </template>

    <!-- ⚠️ La troncature est le seul écart qu'un opérateur ne peut pas voir : 200
         lignes servies ne disent pas s'il en reste 3 ou 3 000, et il croirait sa
         campagne finie. On dit les deux nombres, toujours. -->
    <Notice v-if="truncated" tone="warn" class="pad">
      L'audience compte {{ total }} personnes, cette page en porte {{ selected }}.
      C'est {{ selected }} qui partiront, et le reste attendra un envoi suivant.
    </Notice>

    <div class="pad grid3">
      <Stat label="audience entière" :value="String(total)" />
      <Stat label="dans cet envoi" :value="String(selected)" sub="le nombre à confirmer" />
      <Stat label="langue choisie par la personne" :value="String(withDeclared)"
        :sub="`${withDefault} recevront la langue par défaut`" />
    </div>

    <table v-if="rows.length" class="tbl">
      <thead>
        <tr>
          <th>Personne</th><th>Créé</th><th class="num">Appels</th>
          <th>Dernier signe</th><th>Langue</th><th class="num">Relances</th>
          <th v-if="showOutcome">Envoi</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.sub">
          <td>
            <span class="who">{{ r.name || r.email || r.sub }}</span>
            <span v-if="r.name && r.email" class="dim2">{{ r.email }}</span>
            <span v-if="r.accounts > 1" class="dim2 merged">
              {{ r.accounts }} comptes sur cette adresse — un seul message</span>
          </td>
          <td class="mono">{{ fmtDay(r.created_at) ?? '—' }}</td>
          <td class="num">{{ r.calls }}</td>
          <td class="mono">{{ fmtDay(r.last_seen_at) ?? '—' }}</td>
          <td>
            <!-- La provenance de la langue, pas seulement la langue. -->
            <Tag :tone="r.locale_source === 'declared' ? 'olive' : 'ink'">
              {{ r.served_locale }}</Tag>
            <span class="dim2">{{ r.locale_source === 'declared'
              ? 'choisie par la personne' : 'défaut de la campagne' }}</span>
          </td>
          <td class="num" :class="{ warnnum: r.previous_outreach > 0 }">
            {{ r.previous_outreach }}</td>
          <td v-if="showOutcome">
            <Tag v-if="r.sent === true" tone="olive">parti</Tag>
            <template v-else-if="r.sent === false">
              <Tag tone="terra">non parti</Tag>
              <span class="dim2">{{ r.reason }}</span>
            </template>
            <span v-else class="dim2">—</span>
          </td>
        </tr>
      </tbody>
    </table>
  </ConsoleCard>
</template>

<style scoped>
.pad { padding: 0 var(--pad-card); }
.pad.grid3 { padding-bottom: 14px; }
.who { display: block; color: var(--color-ink); }
.dim2 { display: block; font-size: 11px; color: var(--color-faint); }
/* Un compte déjà relancé se remarque : le serveur l'écartera peut-être, mais c'est
   l'opérateur qui doit savoir qu'il écrit une seconde fois. */
.warnnum { color: var(--color-saffron-ink, var(--color-ink)); font-weight: 700; }
/* La fusion se voit : deux inscriptions, une boîte, un seul mail. */
.merged { color: var(--color-mute); }
</style>

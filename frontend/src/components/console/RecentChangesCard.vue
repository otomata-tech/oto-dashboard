<script setup lang="ts">
// Îlot « Dernières modifications » de l'accueil (oto#191), à la place de l'ancienne carte
// inbox : les pages et procédures modifiées dans ce que la personne peut lire, les plus
// récentes d'abord (`GET /api/me/recent-changes`, `limit=10`).
//
// Il n'énonce que ce que la route rend : un auteur `null` n'affiche AUCUN nom (ni
// identifiant, ni « inconnu »), une liste vide se dit vide, un échec s'affiche comme un
// échec — jamais comme une liste vide. Sans org active, la route rend une liste vide :
// l'état vide couvre ce cas sans le déguiser.
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ConsoleCard from './ConsoleCard.vue'
import Tag from './Tag.vue'
import { getRecentChanges } from '@/api/console'
import type { RecentChange } from '@/types/api'
import { humanize } from '@/lib/errors'
import { changePath, exactDate, relativeSince } from '@/lib/recentChanges'

const LIMIT = 10

const { t, locale } = useI18n()
const items = ref<RecentChange[] | null>(null)   // null = pas encore chargé
const error = ref<string | null>(null)
const now = ref(Date.now())

onMounted(async () => {
  try {
    items.value = (await getRecentChanges(LIMIT)).items
    now.value = Date.now()
  } catch (e) {
    error.value = humanize(e)
  }
})

// Où vit l'élément : le projet d'une page, le palier d'une procédure.
function where(c: RecentChange): string | null {
  if (c.type === 'doc') return c.project?.name ?? null
  return c.scope ? t(`overview.recent.scope.${c.scope}`) : null
}
</script>

<template>
  <ConsoleCard :title="t('overview.recent.title')" :sub="t('overview.recent.sub')">
    <p v-if="error" class="helptext rc-err" role="alert">{{ t('overview.recent.error', { reason: error }) }}</p>
    <p v-else-if="items === null" class="helptext">{{ t('common.loading') }}</p>
    <p v-else-if="!items.length" class="helptext">{{ t('overview.recent.empty') }}</p>
    <div v-else class="rowlist">
      <component :is="changePath(c) ? RouterLink : 'div'" v-for="c in items" :key="`${c.type}:${c.id}`"
        v-bind="changePath(c) ? { to: changePath(c) } : {}" class="rowitem rc-row">
        <span class="rc-title">{{ c.title }}</span>
        <Tag>{{ t(`overview.recent.type.${c.type}`) }}</Tag>
        <span class="rc-meta">
          <span v-if="where(c)" class="rc-where">{{ where(c) }}</span>
          <span v-if="c.author" class="rc-author">{{ c.author.name }}</span>
          <time v-if="relativeSince(c.updated_at, now, locale)" class="rc-when"
            :title="exactDate(c.updated_at, locale) ?? undefined">{{ relativeSince(c.updated_at, now, locale) }}</time>
        </span>
      </component>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.rc-err { color: var(--color-terra-ink); }
.rc-row { flex-wrap: wrap; color: inherit; text-decoration: none; }
a.rc-row:hover .rc-title { text-decoration: underline; }
.rc-title { font-weight: 600; color: var(--color-ink); min-width: 0; overflow-wrap: anywhere; }
.rc-meta { margin-left: auto; display: flex; flex-wrap: wrap; gap: 6px; font-size: var(--fs-small); color: var(--color-mute); }
.rc-meta > * + *::before { content: '·'; margin-right: 6px; color: var(--color-faint); }
</style>

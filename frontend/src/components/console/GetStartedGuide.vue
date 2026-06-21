<script setup lang="ts">
// Tutorial permanent de l'accueil : explique À QUOI sert oto, puis guide
// l'utilisateur en deux niveaux. Niveau 1 « get running » = installer oto dans
// son assistant (Claude / ChatGPT / Mistral), activer des connecteurs, tester.
// Niveau 2 « go further » = doctrine, knowledge (memento), datastore, équipe.
// Les étapes vérifiables sont cochées depuis l'état réel du compte ; les étapes
// d'action manuelle (install, test) restent des consignes numérotées.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ConsoleCard from './ConsoleCard.vue'
import CopyField from './CopyField.vue'
import Btn from './Btn.vue'
import Icon from './Icon.vue'
import Squiggle from './Squiggle.vue'
import { useMe } from '@/composables/useMe'
import { getNamespaces } from '@/api/console'
import { MCP_URL } from '@/types/api'

const props = defineProps<{
  connectorsConfigured: boolean
  doctrineExists: boolean
}>()

const router = useRouter()
const { me } = useMe()

// Datastore : on n'a pas de signal dans `me` → on compte les namespaces.
// Best-effort, ne casse jamais le tutorial (≠ fallback masqué : pas de donnée
// critique ici, juste une coche d'avancement).
const namespacesCount = ref<number | null>(null)
onMounted(async () => {
  try {
    namespacesCount.value = (await getNamespaces()).namespaces.length
  } catch {
    namespacesCount.value = null
  }
})

// ── niveau 1 : installer dans l'assistant ──────────────────────────────────
type Client = { id: string; label: string; steps: string[] }
const clients: Client[] = [
  {
    id: 'claude',
    label: 'claude',
    steps: [
      'open claude.ai (or claude desktop) → settings → connectors.',
      'click « add custom connector », paste the endpoint below.',
      'sign in through the oauth window — oto inherits your account.',
    ],
  },
  {
    id: 'chatgpt',
    label: 'chatgpt',
    steps: [
      'settings → connectors → « add » a remote mcp server.',
      'paste the endpoint below as the server url.',
      'authorize — the tools you enabled here show up in chat.',
    ],
  },
  {
    id: 'mistral',
    label: 'mistral',
    steps: [
      'le chat → settings → connectors → add an mcp connector.',
      'paste the endpoint below and confirm.',
      'sign in with oauth to link your oto account.',
    ],
  },
]
const client = ref<string>('claude')
const activeClient = computed(() => clients.find((c) => c.id === client.value) ?? clients[0]!)

// Prompts d'amorçage, à coller dans l'assistant une fois connecté.
const examplePrompts = [
  'find the french company “doctolib” and summarise its latest financials.',
  'who am i connected as right now, and which tools do i have?',
  'list my available connectors and what each one can do.',
]

// ── coches dérivées de l'état réel ─────────────────────────────────────────
const mementoConnected = computed(() => !!me.value?.memento?.connected)
const hasOrg = computed(() => me.value?.active_org != null)
const datastoreUsed = computed(() => (namespacesCount.value ?? 0) > 0)

// Avancement par niveau = uniquement les étapes vérifiables.
const lvl1Verifiable = computed(() => [props.connectorsConfigured])
const lvl2Verifiable = computed(() => [
  props.doctrineExists,
  mementoConnected.value,
  datastoreUsed.value,
  hasOrg.value,
])
const lvl1Done = computed(() => lvl1Verifiable.value.filter(Boolean).length)
const lvl2Done = computed(() => lvl2Verifiable.value.filter(Boolean).length)

const lvl2Steps = computed(() => [
  {
    done: props.doctrineExists,
    t: 'write your doctrine',
    d: 'one markdown brief your agents read before acting — crm rules, tone, guardrails. it turns oto from « tools » into « your way of working ».',
    act: ['/doctrine', 'open the editor'] as [string, string],
  },
  {
    done: mementoConnected.value,
    t: 'connect your knowledge base',
    d: 'link memento — a structured, sourced memory your agents read and write across sessions. federated into every oto session.',
    act: ['/knowledge', 'connect memento'] as [string, string],
  },
  {
    done: datastoreUsed.value,
    t: 'start a datastore',
    d: 'a per-user table your agents can read and append to (leads, notes, tracking) — native storage, shareable across your org.',
    act: ['/data', 'open datastore'] as [string, string],
  },
  {
    done: hasOrg.value,
    t: 'bring your team',
    d: 'create or join an organization so teammates inherit your keys, doctrine and toolset — one setup, shared.',
    act: ['/org', 'manage organization'] as [string, string],
  },
])
</script>

<template>
  <!-- ── what is oto ── -->
  <ConsoleCard>
    <div class="gs-intro">
      <div class="gs-intro-eyebrow">welcome to oto</div>
      <h2 class="gs-intro-title">
        oto is the <Squiggle>toolbox</Squiggle> your ai assistant plugs into.
      </h2>
      <p class="gs-intro-body">
        connect claude, chatgpt or mistral to oto, and your assistant gains tools to
        actually <em>do</em> things — pull french company data, enrich prospects, search
        the web, drive your crm, send messages, read and write a shared knowledge base.
        you configure it once, here ; your assistant uses it everywhere.
      </p>
    </div>
  </ConsoleCard>

  <!-- ── level 1 : get running ── -->
  <ConsoleCard title="level 1 · get running" :sub="`connect, activate, test — ${lvl1Done} of ${lvl1Verifiable.length} checks done`">
    <div class="gs-prog">
      <div class="track"><div class="fill" :style="{ width: (lvl1Done / lvl1Verifiable.length) * 100 + '%' }" /></div>
    </div>

    <!-- 1 · install -->
    <div class="checkstep">
      <span class="ck">1</span>
      <div style="flex: 1">
        <div class="st-t">install oto in your assistant</div>
        <div class="st-d">add oto as a remote mcp connector. pick your client, then paste the endpoint.</div>
        <div class="seg" style="margin-top: 10px">
          <button v-for="c in clients" :key="c.id" :class="{ on: client === c.id }" @click="client = c.id">
            {{ c.label }}
          </button>
        </div>
        <ol class="gs-steps">
          <li v-for="(s, i) in activeClient.steps" :key="i">{{ s }}</li>
        </ol>
        <CopyField :value="MCP_URL" />
        <div class="helptext" style="margin-top: 8px">
          auth runs over oauth against <code>auth.oto.zone</code> — no api key to paste into your client.
        </div>
      </div>
    </div>

    <!-- 2 · activate connectors -->
    <div class="checkstep" :class="{ done: connectorsConfigured }">
      <span class="ck">
        <Icon v-if="connectorsConfigured" name="check" :size="11" :sw="2.5" />
        <template v-else>2</template>
      </span>
      <div style="flex: 1">
        <div class="st-t">activate your connectors</div>
        <div class="st-d">
          flip on the connectors you need and drop in any provider keys (serper, hunter, a
          crm…). connectors set to « off » stay hidden from your assistant.
        </div>
        <div v-if="!connectorsConfigured" style="margin-top: 8px">
          <Btn kind="mini" @click="router.push('/connectors')">manage connectors →</Btn>
        </div>
      </div>
    </div>

    <!-- 3 · test -->
    <div class="checkstep" style="border-bottom: 0">
      <span class="ck">3</span>
      <div style="flex: 1">
        <div class="st-t">put it to work</div>
        <div class="st-d">back in your assistant, try one of these — oto answers with its tools, no extra setup.</div>
        <div class="gs-prompts">
          <CopyField v-for="(p, i) in examplePrompts" :key="i" :value="p" />
        </div>
      </div>
    </div>
  </ConsoleCard>

  <!-- ── level 2 : go further ── -->
  <ConsoleCard title="level 2 · go further" :sub="`make oto yours — ${lvl2Done} of ${lvl2Verifiable.length} done`">
    <div class="gs-prog">
      <div class="track"><div class="fill" :style="{ width: (lvl2Done / lvl2Verifiable.length) * 100 + '%' }" /></div>
    </div>
    <div v-for="(s, i) in lvl2Steps" :key="i" class="checkstep" :class="{ done: s.done }">
      <span class="ck">
        <Icon v-if="s.done" name="check" :size="11" :sw="2.5" />
        <template v-else>{{ i + 1 }}</template>
      </span>
      <div style="flex: 1">
        <div class="st-t">{{ s.t }}</div>
        <div class="st-d">{{ s.d }}</div>
        <div v-if="!s.done" style="margin-top: 7px">
          <Btn kind="mini" @click="router.push(s.act[0])">{{ s.act[1] }} →</Btn>
        </div>
      </div>
    </div>
  </ConsoleCard>
</template>

<style scoped>
.gs-intro { padding: 4px 2px; }
.gs-intro-eyebrow {
  font-family: var(--font-mono); font-size: 10px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--color-mute);
  margin-bottom: 10px;
}
.gs-intro-title { font-size: 22px; font-weight: 600; line-height: 1.25; margin: 0 0 10px; }
.gs-intro-body {
  font-size: var(--fs-body); color: var(--color-ink-soft); line-height: 1.6;
  max-width: 64ch; margin: 0;
}
.gs-intro-body em { font-style: italic; color: var(--color-ink); }
.gs-steps {
  margin: 10px 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px;
  font-size: var(--fs-small); color: var(--color-mute); line-height: 1.5;
}
.gs-steps li::marker { color: var(--color-faint); }
.gs-prompts { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.gs-prog { margin-bottom: 12px; }
.gs-prog .track { height: 5px; border-radius: 999px; background: var(--color-hair-soft); overflow: hidden; }
.gs-prog .fill { height: 100%; border-radius: 999px; background: var(--color-olive); transition: width var(--t-fast); }
</style>

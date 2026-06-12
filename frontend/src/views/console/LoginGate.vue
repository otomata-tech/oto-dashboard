<script setup lang="ts">
import { useAuth } from '@/composables/useAuth'

const { login } = useAuth()
</script>

<template>
  <div class="console-root" style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--color-bg)">
    <section class="card" style="max-width: 360px; width: 100%; text-align: center; padding: 32px 28px">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 14px">
        <span class="o-medallion o-medallion-sm" style="width: 44px; height: 44px; font-size: 22px">o</span>
        <div>
          <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em">oto console</div>
          <div class="env" style="font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-faint); margin-top: 3px">app.oto.ninja</div>
        </div>
        <p class="helptext" style="margin: 4px 0 6px">
          sign in with your otomata account to manage connectors, doctrine and your org.
        </p>
        <button class="btn" @click="login">sign in</button>
      </div>
    </section>
  </div>
</template>

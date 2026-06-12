<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/api'
import { useAuth } from '@/composables/useAuth'

const { isAuthenticated, userSub, login, logout } = useAuth()

interface Me {
  sub: string
  email: string | null
  name: string | null
  role: string
  active_org: number | null
  active_org_name: string | null
}

const me = ref<Me | null>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  if (!isAuthenticated.value) return
  try {
    me.value = await api<Me>('/api/me')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})
</script>

<template>
  <main class="min-h-screen bg-background flex items-center justify-center p-8">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>oto dashboard</CardTitle>
        <CardDescription>
          Surface produit d'oto-mcp — remplacera account/ d'oto-app (ADR 0007).
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <template v-if="!isAuthenticated">
          <Button @click="login">se connecter</Button>
        </template>
        <template v-else>
          <div class="flex items-center gap-2">
            <Badge variant="secondary">{{ me?.role ?? '…' }}</Badge>
            <span class="text-sm text-muted-foreground">{{ me?.email ?? userSub }}</span>
          </div>
          <p v-if="me?.active_org_name" class="text-sm">
            org active : <strong>{{ me.active_org_name }}</strong>
          </p>
          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
          <div class="flex gap-2">
            <Button as-child>
              <RouterLink to="/connectors">connecteurs</RouterLink>
            </Button>
            <Button variant="outline" @click="logout">se déconnecter</Button>
          </div>
        </template>
      </CardContent>
    </Card>
  </main>
</template>

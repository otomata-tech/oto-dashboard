import { ref } from 'vue'

// Toast minimal partagé pour la console — actions simulées du prototype.
const message = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

export function useToast() {
  function toast(msg: string) {
    message.value = msg
    clearTimeout(timer)
    timer = setTimeout(() => { message.value = null }, 2200)
  }
  return { message, toast }
}

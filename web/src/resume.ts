import { computed, onMounted, ref, type Ref } from 'vue'
import { client, ok } from './api'
import { lsGet } from './ls'
import { useAuth } from './stores/auth'

// "Continue reading": signed in = what the account read most recently (any device), otherwise this browser's last read.
export function useResume<S extends { id: number }>(stories: Ref<S[]>) {
  const auth = useAuth()
  const remote = ref<{ storyId: number; no: number }[]>([]) // newest first
  onMounted(async () => { if (auth.user) remote.value = await ok(client.api.me.progress.get()).catch(() => []) })
  return computed(() => {
    const r = remote.value.find(p => stories.value.some(s => s.id === p.storyId))
    if (r) return { story: stories.value.find(s => s.id === r.storyId)!, no: r.no }
    try {
      const l = JSON.parse(lsGet('lastRead') || 'null')
      const s = l && stories.value.find(x => x.id === l.id)
      return s ? { story: s, no: l.no as number } : null
    } catch { return null }
  })
}

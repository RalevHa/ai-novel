<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { client, ok } from '../api'
import Bar from '../components/ui/Bar.vue'
import Switch from '../components/ui/Switch.vue'
import { fmtDate } from '../genre'
import { useAuth } from '../stores/auth'
import { toastError } from '../toast'

const load = () => ok(client.api.admin.users.get())
type Row = Awaited<ReturnType<typeof load>>[number]
const auth = useAuth()
const rows = ref<Row[]>([]), loading = ref(true)

onMounted(async () => {
  try { rows.value = await load() } catch (e) { toastError(e) }
  loading.value = false
})

async function setRole(r: Row, admin: boolean) {
  const role = admin ? 'admin' : 'user'
  try { await ok(client.api.admin.users({ id: r.id }).patch({ role })); r.role = role }
  catch (e) { toastError(e) }
}
</script>

<template>
  <h1 class="mb-6 font-serif text-[26px] font-bold">จัดการผู้ใช้</h1>
  <Bar v-if="loading" />
  <ul v-else class="divide-y divide-line rounded-xl border border-line bg-surface">
    <li v-for="r in rows" :key="r.id" class="flex items-center gap-3 p-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary font-medium text-on-primary">{{ r.name.slice(0, 1).toUpperCase() }}</span>
      <div class="min-w-0 flex-1">
        <div class="truncate font-medium">{{ r.name }}<span v-if="r.id === auth.user?.id" class="ml-2 rounded-full bg-fg/10 px-2 py-0.5 text-[11px]">คุณ</span></div>
        <div class="muted truncate text-sm">{{ r.email }}<span class="hidden sm:inline"> · สมัคร {{ fmtDate(r.createdAt) }}</span></div>
      </div>
      <Switch :model-value="r.role === 'admin'" label="แอดมิน" :disabled="r.id === auth.user?.id" @update:model-value="setRole(r, !!$event)" />
    </li>
  </ul>
</template>

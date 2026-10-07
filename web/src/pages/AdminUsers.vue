<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { client, ok } from '../api'
import Bar from '../components/ui/Bar.vue'
import { fmtDate, fmtDateTime } from '../genre'
import { useAuth } from '../stores/auth'
import { toastError } from '../toast'

const load = () => ok(client.api.admin.users.get())
type Row = Awaited<ReturnType<typeof load>>[number]
const auth = useAuth()
const loadLog = () => ok(client.api.admin.audit.get())
const rows = ref<Row[]>([]), log = ref<Awaited<ReturnType<typeof loadLog>>>([]), loading = ref(true)
const ROLES = [['user', 'ผู้อ่าน'], ['writer', 'นักเขียน'], ['admin', 'แอดมิน']] as const
type RoleKey = typeof ROLES[number][0]
const roleName = (k: string) => ROLES.find(r => r[0] === k)?.[1] ?? k

onMounted(async () => {
  try { [rows.value, log.value] = await Promise.all([load(), loadLog()]) } catch (e) { toastError(e) }
  loading.value = false
})

async function setRole(r: Row, role: RoleKey) {
  const prev = r.role
  try { await ok(client.api.admin.users({ id: r.id }).patch({ role })); r.role = role; log.value = await loadLog() }
  catch (e) { toastError(e); r.role = prev; (document.getElementById(`role-${r.id}`) as HTMLSelectElement).value = prev } // put the dropdown back
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
      <select :id="`role-${r.id}`" :value="r.role" :disabled="r.id === auth.user?.id" :aria-label="`สิทธิ์ของ ${r.name}`" class="h-11 rounded-lg border border-line bg-surface px-2 text-sm disabled:opacity-60 sm:h-9"
        @change="setRole(r, ($event.target as HTMLSelectElement).value as RoleKey)">
        <option v-for="[k, label] in ROLES" :key="k" :value="k">{{ label }}</option>
      </select>
    </li>
  </ul>

  <h2 class="mb-3 mt-10 font-medium">ประวัติการเปลี่ยนสิทธิ์</h2>
  <p v-if="!loading && !log.length" class="muted text-sm">ยังไม่มีการเปลี่ยนสิทธิ์</p>
  <ul v-else class="divide-y divide-line rounded-xl border border-line bg-surface text-sm">
    <li v-for="l in log" :key="l.id" class="flex flex-wrap gap-x-3 gap-y-1 p-3">
      <span class="muted w-full sm:w-auto">{{ fmtDateTime(l.createdAt) }}</span>
      <span><b>{{ l.actor ?? 'ไม่ทราบ' }}</b> เปลี่ยนสิทธิ์ของ <b>{{ l.target ?? 'ไม่ทราบ' }}</b>: {{ l.detail.split(' → ').map(roleName).join(' → ') }}</span>
    </li>
  </ul>
</template>

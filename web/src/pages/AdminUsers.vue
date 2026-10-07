<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Search, X } from 'lucide-vue-next'
import { client, ok } from '../api'
import Bar from '../components/ui/Bar.vue'
import Button from '../components/ui/Button.vue'
import Modal from '../components/ui/Modal.vue'
import Pager from '../components/ui/Pager.vue'
import { fmtDate, fmtDateTime } from '../genre'
import { useAuth } from '../stores/auth'
import { toast, toastError } from '../toast'

type RoleKey = 'user' | 'writer' | 'admin'
const ROLES: readonly [RoleKey, string][] = [['user', 'ผู้อ่าน'], ['writer', 'นักเขียน'], ['admin', 'แอดมิน']]
const roleName = (k: string) => ROLES.find(r => r[0] === k)?.[1] ?? k
const HINT: Record<RoleKey, string> = { user: 'อ่าน คอมเมนต์ และรีวิวได้', writer: 'เขียนและจัดการเรื่องของตัวเองได้', admin: 'จัดการทุกอย่าง รวมถึงผู้ใช้และงบ AI' }

const auth = useAuth()
const page = ref(1), size = ref(20), q = ref(''), role = ref<RoleKey | ''>('')
const load = () => ok(client.api.admin.users.get({ query: { page: page.value, size: size.value, q: q.value.trim() || undefined, role: role.value || undefined } }))
type Data = Awaited<ReturnType<typeof load>>
type Row = Data['items'][number]
const data = ref<Data | null>(null), loading = ref(true)
const loadLog = () => ok(client.api.admin.audit.get())
const log = ref<Awaited<ReturnType<typeof loadLog>>>([])
const pending = ref<{ row: Row; role: RoleKey } | null>(null), busy = ref(false)

async function refresh() {
  try { data.value = await load(); page.value = data.value.page } catch (e) { toastError(e) }
  loading.value = false
}
onMounted(async () => { refresh(); try { log.value = await loadLog() } catch (e) { toastError(e) } })
watch(page, refresh)
watch(role, () => { page.value === 1 ? refresh() : (page.value = 1) })
let typing: ReturnType<typeof setTimeout> | undefined
watch(q, () => { clearTimeout(typing); typing = setTimeout(() => { page.value === 1 ? refresh() : (page.value = 1) }, 300) }) // back to page 1, then the page watcher reloads

// a plain change applies at once; giving admin rights asks first, since it hands over everything
function choose(r: Row, next: RoleKey, el: HTMLSelectElement) {
  if (next === r.role) return
  if (next === 'admin') { pending.value = { row: r, role: next }; el.value = r.role; return }
  save(r, next)
}
async function save(r: Row, next: RoleKey) {
  busy.value = true
  try {
    await ok(client.api.admin.users({ id: r.id }).patch({ role: next }))
    toast(`${r.name} เป็น${roleName(next)}แล้ว`)
    pending.value = null
    await Promise.all([refresh(), loadLog().then(l => { log.value = l })])
  } catch (e) { toastError(e); await refresh() } finally { busy.value = false }
}

const chips = computed(() => [['', 'ทั้งหมด', data.value?.counts.all], ['admin', 'แอดมิน', data.value?.counts.admin], ['writer', 'นักเขียน', data.value?.counts.writer], ['user', 'ผู้อ่าน', data.value?.counts.user]] as const)
const chip = (on: boolean) => ['inline-flex min-h-11 items-center rounded-full border px-3.5 py-1.5 text-sm transition-colors sm:min-h-9', on ? 'border-primary bg-primary text-on-primary' : 'border-line hover:bg-fg/5']
const badge = (r: RoleKey) => ['rounded-full px-2 py-0.5 text-[11px]', r === 'admin' ? 'bg-danger/15 text-danger' : r === 'writer' ? 'bg-primary/15 text-primary' : 'bg-fg/10']
</script>

<template>
  <h1 class="mb-1 font-serif text-[26px] font-bold">จัดการผู้ใช้</h1>
  <p v-if="data" class="muted mb-5 text-sm">ผู้ใช้ทั้งหมด {{ data.counts.all }} คน · เปลี่ยนสิทธิ์ได้จากรายการด้านล่าง ทุกครั้งที่เปลี่ยนจะถูกบันทึกประวัติไว้</p>

  <div class="mb-3 flex flex-wrap gap-2" role="group" aria-label="กรองตามสิทธิ์">
    <button v-for="[k, label, n] in chips" :key="k" type="button" :class="chip(role === k)" :aria-pressed="role === k" @click="role = k">{{ label }}<span v-if="n !== undefined" class="ml-1.5 tabular-nums opacity-80">{{ n }}</span></button>
  </div>

  <div class="relative mb-4">
    <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg/60" aria-hidden="true" />
    <input v-model="q" type="text" inputmode="search" autocomplete="off" aria-label="ค้นหาผู้ใช้" placeholder="ค้นหาจากชื่อหรืออีเมล"
      class="h-11 w-full rounded-lg border border-line bg-surface pl-9 pr-11 outline-none placeholder:text-fg/40 focus:border-primary focus:ring-2 focus:ring-primary/25" />
    <button v-if="q" type="button" class="absolute inset-y-0 right-0 grid w-11 place-items-center text-fg/60 hover:text-fg" aria-label="ล้างคำค้นหา" @click="q = ''"><X class="size-4" /></button>
  </div>

  <Bar v-if="loading" />
  <div v-else-if="data && !data.items.length" class="rounded-xl border border-line bg-surface px-6 py-8 text-center">
    <p class="font-medium">ไม่พบผู้ใช้ที่ตรงกับที่ค้นหา</p>
    <Button variant="outline" size="sm" class="mt-3" @click="q = ''; role = ''">ล้างตัวกรอง</Button>
  </div>
  <ul v-else-if="data" class="divide-y divide-line rounded-xl border border-line bg-surface">
    <li v-for="r in data.items" :key="r.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary font-medium text-on-primary" aria-hidden="true">{{ r.name.slice(0, 1).toUpperCase() }}</span>
      <div class="min-w-0 flex-1 basis-48">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <router-link v-if="r.role !== 'user' || r.storyCount" :to="`/author/${r.id}`" class="truncate font-medium hover:text-primary">{{ r.name }}</router-link>
          <span v-else class="truncate font-medium">{{ r.name }}</span>
          <span v-if="r.id === auth.user?.id" class="rounded-full bg-fg/10 px-2 py-0.5 text-[11px]">คุณ</span>
          <span :class="badge(r.role)">{{ roleName(r.role) }}</span>
        </div>
        <div class="muted truncate text-sm">{{ r.email }}</div>
        <div class="muted text-xs">สมัคร {{ fmtDate(r.createdAt) }}<template v-if="r.storyCount"> · {{ r.storyCount }} เรื่อง</template></div>
      </div>
      <span v-if="r.id === auth.user?.id" class="muted text-xs">เปลี่ยนสิทธิ์ของตัวเองไม่ได้</span>
      <select v-else :value="r.role" :disabled="busy" :aria-label="`สิทธิ์ของ ${r.name}`" class="h-11 rounded-lg border border-line bg-surface px-2 text-sm disabled:opacity-60 sm:h-9"
        @change="choose(r, ($event.target as HTMLSelectElement).value as RoleKey, $event.target as HTMLSelectElement)">
        <option v-for="[k, label] in ROLES" :key="k" :value="k">{{ label }}</option>
      </select>
    </li>
  </ul>
  <Pager v-if="data" v-model="page" :size="data.size" :total="data.total" />

  <details class="mt-10">
    <summary class="cursor-pointer select-none font-medium">ประวัติการเปลี่ยนสิทธิ์<span class="muted ml-2 text-sm font-normal">({{ log.length }}<template v-if="log.length >= 50">+</template>)</span></summary>
    <p v-if="!log.length" class="muted mt-3 text-sm">ยังไม่มีการเปลี่ยนสิทธิ์</p>
    <ul v-else class="mt-3 divide-y divide-line rounded-xl border border-line bg-surface text-sm">
      <li v-for="l in log" :key="l.id" class="flex flex-wrap gap-x-3 gap-y-1 p-3">
        <span class="muted w-full sm:w-auto">{{ fmtDateTime(l.createdAt) }}</span>
        <span><b>{{ l.actor ?? 'ไม่ทราบ' }}</b> เปลี่ยนสิทธิ์ของ <b>{{ l.target ?? 'ไม่ทราบ' }}</b>: {{ l.detail.split(' → ').map(roleName).join(' → ') }}</span>
      </li>
    </ul>
  </details>

  <Modal :open="!!pending" :title="`ให้สิทธิ์แอดมินกับ ${pending?.row.name}?`" size="sm" @close="pending = null">
    <p class="muted">{{ HINT.admin }} และยกเลิกได้ภายหลังจากหน้านี้เท่านั้น เปลี่ยนแล้วจะถูกบันทึกในประวัติ</p>
    <template #footer>
      <Button variant="ghost" @click="pending = null">ยกเลิก</Button>
      <Button variant="danger" :loading="busy" @click="pending && save(pending.row, pending.role)">ให้สิทธิ์แอดมิน</Button>
    </template>
  </Modal>
</template>

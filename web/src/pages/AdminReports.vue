<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { client, ok } from '../api'
import Bar from '../components/ui/Bar.vue'
import Button from '../components/ui/Button.vue'
import { fmtDateTime } from '../genre'
import { toast, toastError } from '../toast'

const load = () => ok(client.api.admin.reports.get())
type Row = Awaited<ReturnType<typeof load>>[number]
const rows = ref<Row[]>([]), loading = ref(true), confirmId = ref<number | null>(null), busy = ref(false)

const refresh = async () => { try { rows.value = await load() } catch (e) { toastError(e) } loading.value = false }
onMounted(refresh)

async function act(fn: () => Promise<unknown>, done: string) {
  busy.value = true
  try { await fn(); confirmId.value = null; toast(done); await refresh() } catch (e) { toastError(e) } finally { busy.value = false }
}
const dismiss = (r: Row) => act(() => ok(client.api.admin.reports({ id: r.commentId }).dismiss.post()), 'ปิดรายงานแล้ว')
const remove = (r: Row) => act(() => ok(client.api.comments({ id: r.commentId }).delete()), 'ลบความคิดเห็นแล้ว')
</script>

<template>
  <h1 class="mb-1 font-serif text-[26px] font-bold">รายงานความคิดเห็น</h1>
  <p class="muted mb-5 text-sm">ความคิดเห็นที่ผู้อ่านแจ้งเข้ามา ลบแล้วจะถูกบันทึกในประวัติที่หน้า "ผู้ใช้"</p>

  <Bar v-if="loading" />
  <div v-else-if="!rows.length" class="rounded-xl border border-line bg-surface px-6 py-10 text-center">
    <p class="font-serif text-lg font-bold">ไม่มีรายงานค้างอยู่</p>
  </div>
  <ul v-else class="space-y-3">
    <li v-for="r in rows" :key="r.commentId" class="rounded-xl border border-line bg-surface p-4">
      <div class="muted flex flex-wrap items-center gap-x-2 text-xs">
        <router-link :to="{ path: `/story/${r.storyId}/read/${r.no}`, query: { comments: '1' } }" class="text-primary underline underline-offset-2">{{ r.storyTitle }} · ตอนที่ {{ r.no }}</router-link>
        <span>· เขียนโดย <b class="text-fg">{{ r.author }}</b></span>
      </div>
      <p class="mt-2 whitespace-pre-wrap break-words leading-relaxed">{{ r.body }}</p>
      <div class="mt-3 rounded-lg bg-fg/5 p-3 text-sm">
        <div class="font-medium">รายงาน {{ r.reports.length }} ครั้ง</div>
        <ul class="muted mt-1 space-y-0.5 text-xs">
          <li v-for="(x, i) in r.reports" :key="i">{{ x.reporter }} · {{ fmtDateTime(x.reportedAt) }}<template v-if="x.reason"> · “{{ x.reason }}”</template></li>
        </ul>
      </div>
      <div class="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" :disabled="busy" @click="dismiss(r)">ไม่มีปัญหา</Button>
        <Button v-if="confirmId !== r.commentId" variant="outline" :disabled="busy" @click="confirmId = r.commentId">ลบความคิดเห็น</Button>
        <template v-else>
          <Button variant="danger" :loading="busy" @click="remove(r)">ยืนยันลบ</Button>
          <Button variant="ghost" @click="confirmId = null">ยกเลิก</Button>
        </template>
      </div>
    </li>
  </ul>
</template>

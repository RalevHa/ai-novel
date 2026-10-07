<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { BookOpen, ChevronUp, MessageSquare } from 'lucide-vue-next'
import { client, ok } from '../api'
import Bar from '../components/ui/Bar.vue'
import { fmtDateTime } from '../genre'
import { useNotifications } from '../stores/notifications'
import { toastError } from '../toast'

const load = () => ok(client.api.me.notifications.get())
const items = ref<Awaited<ReturnType<typeof load>>>([]), loading = ref(true)
const bell = useNotifications()

onMounted(async () => {
  try {
    items.value = await load() // the rows keep their "new" dot for this visit; the server marks them read right after
    if (items.value.some(n => n.unread)) { await ok(client.api.me.notifications.read.post()); bell.unread = 0 }
  } catch (e) { toastError(e) }
  loading.value = false
})
</script>

<template>
  <div class="mx-auto max-w-[640px]">
    <h1 class="mb-1 font-serif text-[26px] font-bold">การแจ้งเตือน</h1>
    <p class="muted mb-5 text-sm">ตอนใหม่ของเรื่องที่ติดตาม และการตอบกลับหรือโหวตขึ้นให้ความคิดเห็นของคุณ</p>

    <Bar v-if="loading" />
    <div v-else-if="!items.length" class="rounded-xl border border-line bg-surface px-6 py-10 text-center">
      <p class="font-serif text-lg font-bold">ยังไม่มีการแจ้งเตือน</p>
      <p class="muted mt-1 text-sm">เมื่อเรื่องที่ติดตามมีตอนใหม่ หรือมีคนตอบกลับ/โหวตขึ้นให้ความคิดเห็นของคุณ จะมาแสดงที่นี่</p>
    </div>
    <ul v-else class="divide-y divide-line rounded-xl border border-line bg-surface">
      <li v-for="n in items" :key="n.key">
        <router-link :to="{ path: `/story/${n.storyId}/read/${n.no}`, query: n.type === 'chapter' ? {} : { comments: '1' } }" :class="['flex gap-3 p-3 hover:bg-fg/5', n.unread && 'bg-primary/5']">
          <span class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary" aria-hidden="true">
            <BookOpen v-if="n.type === 'chapter'" class="size-4" /><MessageSquare v-else-if="n.type === 'reply'" class="size-4" /><ChevronUp v-else class="size-5" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm">
              <template v-if="n.type === 'chapter'"><b>{{ n.storyTitle }}</b> มีตอนใหม่ {{ n.count }} ตอนที่ยังไม่ได้อ่าน</template>
              <template v-else-if="n.type === 'reply'"><b>{{ n.actor ?? 'ผู้ใช้ที่ลบบัญชีแล้ว' }}</b> ตอบกลับความคิดเห็นของคุณ</template>
              <template v-else>ความคิดเห็นของคุณได้รับโหวตขึ้น <span class="muted">(คะแนนตอนนี้ {{ n.score }})</span></template>
              <span v-if="n.unread" class="ml-2 rounded-full bg-primary px-1.5 py-0.5 align-middle text-[10px] text-on-primary">ใหม่</span>
            </span>
            <span v-if="n.snippet" class="mt-1 line-clamp-2 block break-words text-sm text-fg/80">“{{ n.snippet }}”</span>
            <span v-if="n.type === 'chapter'" class="muted mt-1 block text-xs">เริ่มอ่านที่ตอนที่ {{ n.no }} · ปล่อยล่าสุด {{ fmtDateTime(n.createdAt) }}</span>
            <span v-else class="muted mt-1 block text-xs">{{ n.storyTitle }} · ตอนที่ {{ n.no }} · {{ fmtDateTime(n.createdAt) }}</span>
          </span>
        </router-link>
      </li>
    </ul>
  </div>
</template>

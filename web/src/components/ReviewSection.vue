<script setup lang="ts">
import { ref, watch } from 'vue'
import { Star } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { client, ok } from '../api'
import { fmtDateTime } from '../genre'
import { useAuth } from '../stores/auth'
import { toast, toastError } from '../toast'
import Button from './ui/Button.vue'
import Pager from './ui/Pager.vue'
import Textarea from './ui/Textarea.vue'

// Community reviews of a story: one per reader (editable), 1-5 stars plus optional text. The author cannot review their own story.
const props = defineProps<{ storyId: number; authorId: number }>()
const MAX = 2000
const auth = useAuth(), route = useRoute()

const fetchPage = (page: number) => ok(client.api.stories({ id: props.storyId }).reviews.get({ query: { page } }))
const data = ref<Awaited<ReturnType<typeof fetchPage>> | null>(null)
// Eden turns timestamps into Date objects, so compare the times, not the objects (`!==` on two Dates is always true)
const edited = (r: { createdAt: string | Date; updatedAt: string | Date }) => +new Date(r.updatedAt) !== +new Date(r.createdAt)
const page = ref(1), rating = ref(0), text = ref(''), busy = ref(false), confirmId = ref<number | null>(null)

async function load() {
  try {
    data.value = await fetchPage(page.value); page.value = data.value.page
    // the form always shows the reader's own review, so saving again is an edit
    rating.value = data.value.mine?.rating ?? rating.value; text.value = data.value.mine?.body ?? text.value
  } catch (e) { toastError(e) }
}
watch(() => props.storyId, () => { page.value = 1; data.value = null; load() }, { immediate: true })
watch(page, load)

async function send() {
  if (!rating.value) return
  busy.value = true
  try {
    const edit = !!data.value?.mine
    await ok(client.api.stories({ id: props.storyId }).reviews.put({ rating: rating.value, body: text.value }))
    page.value = 1; await load()
    toast(edit ? 'แก้ไขรีวิวแล้ว' : 'ส่งรีวิวแล้ว')
  } catch (e) { toastError(e) } finally { busy.value = false }
}

async function remove(id: number) {
  try {
    const mine = data.value?.mine?.id === id
    await ok(client.api.reviews({ id }).delete()); confirmId.value = null
    if (mine) { rating.value = 0; text.value = '' }
    await load()
  } catch (e) { toastError(e) }
}
</script>

<template>
  <section aria-labelledby="reviews-h" class="mt-12">
    <h2 id="reviews-h" class="font-serif text-xl font-bold">รีวิวจากผู้อ่าน<span v-if="data" class="muted ml-2 text-sm font-normal">· {{ data.total }}</span></h2>

    <div v-if="data && data.total" class="mt-4 flex items-center gap-6">
      <div class="text-center">
        <div class="font-serif text-4xl font-bold tabular-nums">{{ data.average.toFixed(1) }}</div>
        <div class="flex justify-center text-primary" role="img" :aria-label="`คะแนนเฉลี่ย ${data.average.toFixed(1)} จาก 5`">
          <Star v-for="n in 5" :key="n" :class="['size-4', n <= Math.round(data.average) && 'fill-current']" aria-hidden="true" />
        </div>
      </div>
      <ul class="min-w-0 flex-1 space-y-1 text-xs" aria-label="จำนวนรีวิวแยกตามดาว">
        <li v-for="n in [5, 4, 3, 2, 1]" :key="n" class="flex items-center gap-2">
          <span class="w-3 tabular-nums">{{ n }}</span>
          <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-fg/10"><span class="block h-full rounded-full bg-primary" :style="{ width: `${(data.dist[n - 1] / data.total) * 100}%` }" /></span>
          <span class="muted w-6 text-right tabular-nums">{{ data.dist[n - 1] }}</span>
        </li>
      </ul>
    </div>

    <div class="mt-6">
      <form v-if="auth.user && auth.user.id !== authorId" @submit.prevent="send">
        <div class="mb-2 text-sm font-medium">{{ data?.mine ? 'รีวิวของคุณ' : 'ให้คะแนนเรื่องนี้' }}</div>
        <div class="mb-3 flex" role="radiogroup" aria-label="ให้ดาว">
          <button v-for="n in 5" :key="n" type="button" role="radio" :aria-checked="rating === n" :aria-label="`${n} ดาว`" class="grid size-11 place-items-center text-primary" @click="rating = n">
            <Star :class="['size-7', n <= rating && 'fill-current']" aria-hidden="true" />
          </button>
        </div>
        <Textarea v-model="text" :rows="4" placeholder="เล่าความรู้สึกหลังอ่าน (ไม่บังคับ)" compact />
        <div class="mt-2 flex items-center justify-between gap-3">
          <span :class="['text-xs', text.length > MAX ? 'text-danger' : 'muted']">{{ MAX - text.length }}</span>
          <Button type="submit" :loading="busy" :disabled="!rating || text.length > MAX">{{ data?.mine ? 'บันทึกการแก้ไข' : 'ส่งรีวิว' }}</Button>
        </div>
      </form>
      <p v-else-if="!auth.user" class="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
        <router-link :to="{ path: '/login', query: { next: route.fullPath } }" class="-my-3 inline-block py-3 text-primary underline underline-offset-2">เข้าสู่ระบบ</router-link> เพื่อรีวิวเรื่องนี้
      </p>
      <p v-else class="muted text-sm">ผู้แต่งรีวิวเรื่องของตัวเองไม่ได้</p>
    </div>

    <p v-if="data && !data.items.length" class="muted mt-6 text-sm">ยังไม่มีรีวิว เป็นคนแรกที่รีวิวเรื่องนี้</p>
    <ul v-else-if="data" class="mt-6 divide-y divide-line">
      <li v-for="r in data.items" :key="r.id" class="py-3">
        <div class="flex flex-wrap items-center gap-x-2 text-sm">
          <span class="font-medium">{{ r.userName }}</span>
          <span class="flex text-primary" role="img" :aria-label="`${r.rating} ดาว`"><Star v-for="n in 5" :key="n" :class="['size-3.5', n <= r.rating && 'fill-current']" aria-hidden="true" /></span>
          <span class="muted text-xs">{{ fmtDateTime(r.updatedAt) }}<template v-if="edited(r)"> (แก้ไขแล้ว)</template></span>
          <span class="flex-1" />
          <template v-if="r.canDelete">
            <Button v-if="confirmId !== r.id" variant="ghost" size="sm" @click="confirmId = r.id">ลบ</Button>
            <template v-else>
              <Button variant="danger" size="sm" @click="remove(r.id)">ยืนยันลบ</Button>
              <Button variant="ghost" size="sm" @click="confirmId = null">ยกเลิก</Button>
            </template>
          </template>
        </div>
        <p v-if="r.body" class="mt-1 whitespace-pre-wrap break-words leading-relaxed">{{ r.body }}</p>
      </li>
    </ul>
    <Pager v-if="data" v-model="page" :size="data.size" :total="data.total" />
  </section>
</template>

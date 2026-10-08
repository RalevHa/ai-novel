<script setup lang="ts">
import { ref, watch } from 'vue'
import { ChevronDown, ChevronUp, Star } from 'lucide-vue-next'
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

// votes and replies under a review (same rules as chapter comments; replies are one flat list)
const REPLY_MAX = 1000
const replyingTo = ref<number | null>(null), replyText = ref(''), confirmReply = ref<number | null>(null)
const vote = (r: { id: number; score: number; myVote: number | null }, value: -1 | 0 | 1) =>
  ok(client.api.reviews({ id: r.id }).vote.put({ value })).then(v => Object.assign(r, v), toastError)
async function sendReply(reviewId: number) {
  busy.value = true
  try {
    await ok(client.api.reviews({ id: reviewId }).replies.post({ body: replyText.value }))
    replyingTo.value = null; replyText.value = ''; await load()
  } catch (e) { toastError(e) } finally { busy.value = false }
}
async function removeReply(id: number) {
  try { await ok(client.api['review-replies']({ id }).delete()); confirmReply.value = null; await load() } catch (e) { toastError(e) }
}
const voteBtn = (on: boolean) => ['grid size-11 place-items-center rounded-lg hover:bg-fg/5 disabled:opacity-40 sm:size-8', on && 'text-primary']

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
        <div class="mt-1 flex flex-wrap items-center gap-1">
          <button type="button" :class="voteBtn(r.myVote === 1)" :disabled="r.userId === auth.user?.id || !auth.user" :aria-pressed="r.myVote === 1" aria-label="รีวิวนี้มีประโยชน์" @click="vote(r, r.myVote === 1 ? 0 : 1)"><ChevronUp class="size-5" aria-hidden="true" /></button>
          <span class="min-w-4 text-center text-sm tabular-nums" :aria-label="`คะแนน ${r.score}`">{{ r.score }}</span>
          <button type="button" :class="voteBtn(r.myVote === -1)" :disabled="r.userId === auth.user?.id || !auth.user" :aria-pressed="r.myVote === -1" aria-label="รีวิวนี้ไม่มีประโยชน์" @click="vote(r, r.myVote === -1 ? 0 : -1)"><ChevronDown class="size-5" aria-hidden="true" /></button>
          <Button v-if="auth.user" variant="ghost" size="sm" @click="replyingTo = replyingTo === r.id ? null : r.id; replyText = ''">ตอบกลับ</Button>
        </div>
        <ul v-if="r.replies.length" class="mt-2 space-y-3 border-l-2 border-line pl-3">
          <li v-for="p in r.replies" :key="p.id">
            <div class="flex flex-wrap items-center gap-x-2 text-sm">
              <span class="font-medium">{{ p.userName }}</span>
              <span v-if="p.isAuthor" class="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">ผู้แต่ง</span>
              <span class="muted text-xs">{{ fmtDateTime(p.createdAt) }}</span>
              <span class="flex-1" />
              <template v-if="p.canDelete">
                <Button v-if="confirmReply !== p.id" variant="ghost" size="sm" @click="confirmReply = p.id">ลบ</Button>
                <template v-else>
                  <Button variant="danger" size="sm" @click="removeReply(p.id)">ยืนยันลบ</Button>
                  <Button variant="ghost" size="sm" @click="confirmReply = null">ยกเลิก</Button>
                </template>
              </template>
            </div>
            <p class="mt-0.5 whitespace-pre-wrap break-words leading-relaxed">{{ p.body }}</p>
          </li>
        </ul>
        <form v-if="replyingTo === r.id" class="mt-2" @submit.prevent="sendReply(r.id)">
          <Textarea v-model="replyText" :rows="3" placeholder="เขียนตอบกลับ" compact />
          <div class="mt-2 flex items-center justify-between gap-3">
            <span :class="['text-xs', replyText.length > REPLY_MAX ? 'text-danger' : 'muted']">{{ REPLY_MAX - replyText.length }}</span>
            <span class="flex gap-2">
              <Button variant="ghost" size="sm" @click="replyingTo = null">ยกเลิก</Button>
              <Button type="submit" size="sm" :loading="busy" :disabled="!replyText.trim() || replyText.length > REPLY_MAX">ส่ง</Button>
            </span>
          </div>
        </form>
      </li>
    </ul>
    <Pager v-if="data" v-model="page" :size="data.size" :total="data.total" />
  </section>
</template>

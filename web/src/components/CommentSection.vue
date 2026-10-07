<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, MessageSquare } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { client, ok } from '../api'
import { useAuth } from '../stores/auth'
import { toast, toastError } from '../toast'
import CommentItem, { type CommentView } from './CommentItem.vue'
import Button from './ui/Button.vue'
import Pager from './ui/Pager.vue'
import Segmented from './ui/Segmented.vue'
import Textarea from './ui/Textarea.vue'

// Comments on one chapter. `collapsible` keeps them folded away (the reader page stays as tall as the text).
const props = defineProps<{ storyId: number; no: number; collapsible?: boolean }>()
const MAX = 1000
const auth = useAuth(), route = useRoute()

const chapter = () => client.api.stories({ id: props.storyId }).chapters({ no: props.no })
type Sort = 'new' | 'top' | 'replies'
const SORTS = [{ k: 'new', n: 'ใหม่ล่าสุด' }, { k: 'top', n: 'ยอดนิยม' }, { k: 'replies', n: 'ตอบกลับมากสุด' }] as const
const sort = ref<Sort>('new')
const fetchPage = (page: number) => ok(chapter().comments.get({ query: { page, sort: sort.value } }))
const data = ref<Awaited<ReturnType<typeof fetchPage>> | null>(null)
const page = ref(1), text = ref(''), busy = ref(false), open = ref(!props.collapsible), confirmId = ref<number | null>(null)
// the reply box open under one thread; answering a reply is also posted to that thread, with the person's name in front
const replyTo = ref<{ thread: number; parentId: number } | null>(null), replyText = ref('')
const remaining = computed(() => MAX - text.value.length)

async function load() {
  try { data.value = await fetchPage(page.value); page.value = data.value.page } catch (e) { toastError(e) }
}
watch(() => [props.storyId, props.no], () => { page.value = 1; data.value = null; load() }, { immediate: true })
watch(page, load)
watch(sort, () => { if (page.value === 1) load(); else page.value = 1 })

async function send() {
  if (!text.value.trim()) return
  busy.value = true
  try {
    await ok(chapter().comments.post({ body: text.value }))
    text.value = ''
    if (page.value === 1) await load(); else page.value = 1 // newest first, so the new one is on page 1
    toast('ส่งความคิดเห็นแล้ว')
  } catch (e) { toastError(e) } finally { busy.value = false }
}

function startReply(thread: number, c: CommentView, isReply: boolean) {
  if (!auth.user) { toast('เข้าสู่ระบบก่อนจึงจะตอบกลับได้', 'error'); return }
  replyTo.value = { thread, parentId: c.id }
  replyText.value = isReply ? `@${c.userName} ` : ''
}

async function sendReply() {
  if (!replyTo.value || !replyText.value.trim()) return
  busy.value = true
  try {
    await ok(chapter().comments.post({ body: replyText.value, parentId: replyTo.value.parentId }))
    replyTo.value = null; replyText.value = ''
    await load()
    toast('ส่งการตอบกลับแล้ว')
  } catch (e) { toastError(e) } finally { busy.value = false }
}

async function vote(c: CommentView, value: -1 | 0 | 1) {
  if (!auth.user) { toast('เข้าสู่ระบบก่อนจึงจะโหวตได้', 'error'); return }
  try { Object.assign(c, await ok(client.api.comments({ id: c.id }).vote.put({ value }))) } catch (e) { toastError(e) } // the list keeps its order until it is reloaded
}

async function remove(id: number) {
  try { await ok(client.api.comments({ id }).delete()); confirmId.value = null; await load() } catch (e) { toastError(e) }
}
</script>

<template>
  <section data-comments aria-labelledby="comments-h" class="mt-10">
    <h2 id="comments-h" class="font-serif text-xl font-bold">
      <button v-if="collapsible" type="button" class="-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-fg/5" :aria-expanded="open" @click="open = !open">
        <MessageSquare class="size-5" aria-hidden="true" />ความคิดเห็น<span v-if="data" class="muted text-sm font-normal">({{ data.all }})</span>
        <ChevronDown :class="['size-4 transition-transform', open && 'rotate-180']" aria-hidden="true" />
      </button>
      <template v-else>ความคิดเห็น<span v-if="data" class="muted ml-2 text-sm font-normal">· {{ data.all }}</span></template>
    </h2>

    <div v-show="open" class="mt-4">
      <form v-if="auth.user" @submit.prevent="send">
        <Textarea v-model="text" :rows="3" placeholder="เขียนความคิดเห็น…" compact />
        <div class="mt-2 flex items-center justify-between gap-3">
          <span :class="['text-xs', remaining < 0 ? 'text-danger' : 'muted']">{{ remaining }}</span>
          <Button type="submit" :loading="busy" :disabled="!text.trim() || remaining < 0">ส่ง</Button>
        </div>
      </form>
      <p v-else class="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
        <router-link :to="{ path: '/login', query: { next: route.fullPath } }" class="-my-3 inline-block py-3 text-primary underline underline-offset-2">เข้าสู่ระบบ</router-link> เพื่อแสดงความคิดเห็น
      </p>

      <div v-if="data && data.total > 1" class="mt-6 max-w-sm"><Segmented :model-value="sort" :options="SORTS" label="เรียงความคิดเห็น" @update:model-value="sort = $event as Sort" /></div>
      <p v-if="data && !data.items.length" class="muted mt-6 text-sm">ยังไม่มีความคิดเห็น</p>
      <ul v-else-if="data" class="mt-4 divide-y divide-line">
        <li v-for="c in data.items" :key="c.id" class="py-3">
          <CommentItem :c="c" :confirming="confirmId === c.id" @vote="vote(c, $event)" @reply="startReply(c.id, c, false)" @ask-delete="confirmId = c.id" @cancel-delete="confirmId = null" @remove="remove(c.id)" />
          <ul v-if="c.replies.length" class="ml-4 mt-2 space-y-3 border-l border-line pl-3 sm:ml-11">
            <li v-for="r in c.replies" :key="r.id">
              <CommentItem :c="r" :confirming="confirmId === r.id" @vote="vote(r, $event)" @reply="startReply(c.id, r, true)" @ask-delete="confirmId = r.id" @cancel-delete="confirmId = null" @remove="remove(r.id)" />
            </li>
          </ul>
          <form v-if="replyTo?.thread === c.id" class="ml-4 mt-3 sm:ml-11" @submit.prevent="sendReply">
            <Textarea v-model="replyText" :rows="2" placeholder="เขียนการตอบกลับ…" compact />
            <div class="mt-2 flex justify-end gap-2">
              <Button variant="ghost" @click="replyTo = null">ยกเลิก</Button>
              <Button type="submit" :loading="busy" :disabled="!replyText.trim() || replyText.length > MAX">ส่ง</Button>
            </div>
          </form>
        </li>
      </ul>
      <Pager v-if="data" v-model="page" :size="data.size" :total="data.total" />
    </div>
  </section>
</template>

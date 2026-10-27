<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { UserCheck, UserPlus } from 'lucide-vue-next'
import { client, ok } from '../api'
import BookCover from '../components/BookCover.vue'
import RatingLine from '../components/RatingLine.vue'
import Bar from '../components/ui/Bar.vue'
import Button from '../components/ui/Button.vue'
import { setTitle } from '../title'
import { ask } from '../confirm'
import { toast } from '../toast'
import { useAuth } from '../stores/auth'
import { useAuthorFollows } from '../stores/authorFollows'

const id = Number(useRoute().params.id), router = useRouter(), auth = useAuth(), follows = useAuthorFollows()
const load = () => ok(client.api.authors({ id }).get())
const author = ref<Awaited<ReturnType<typeof load>> | null>(null), loading = ref(true), error = ref('')

onMounted(async () => {
  try { author.value = await load(); setTitle(author.value.name) } catch (e) { error.value = (e as Error).message }
  loading.value = false
  follows.load()
})

async function follow() {
  if (!auth.user) { toast('เข้าสู่ระบบก่อนจึงจะติดตามผู้แต่งได้'); router.push({ path: '/login', query: { next: `/author/${id}` } }); return }
  if (follows.has(id) && !await ask({ title: 'เลิกติดตามผู้แต่งคนนี้?', body: 'จะไม่ได้รับแจ้งเตือนเมื่อมีเรื่องใหม่ ติดตามใหม่ได้ทุกเมื่อ', confirmLabel: 'เลิกติดตาม' })) return
  try { await follows.toggle(id); toast(follows.has(id) ? 'ติดตามผู้แต่งแล้ว จะแจ้งเตือนเมื่อมีเรื่องใหม่' : 'เลิกติดตามแล้ว') } catch (e) { toast((e as Error).message, 'error') }
}
</script>

<template>
  <Bar v-if="loading" />
  <p v-if="error" class="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{{ error }}</p>
  <template v-if="author">
    <header class="mb-8 flex items-start gap-4">
      <span class="grid size-16 shrink-0 place-items-center rounded-full bg-primary text-2xl font-medium text-on-primary" aria-hidden="true">{{ author.name.slice(0, 1).toUpperCase() }}</span>
      <div class="min-w-0 flex-1">
        <div class="eyebrow mb-1">ผู้แต่ง</div>
        <h1 class="font-serif text-[clamp(26px,4vw,38px)] font-bold leading-snug">{{ author.name }}</h1>
        <p v-if="author.bio" class="mt-3 max-w-[62ch] whitespace-pre-wrap leading-[1.85] text-fg/85">{{ author.bio }}</p>
        <Button v-if="auth.user?.id === author.id" to="/profile" variant="outline" size="sm" class="mt-3">แก้ไขโปรไฟล์</Button>
        <Button v-else variant="outline" size="sm" class="mt-3" :aria-pressed="follows.has(author.id)" @click="follow"><UserCheck v-if="follows.has(author.id)" class="size-4" /><UserPlus v-else class="size-4" />{{ follows.has(author.id) ? 'ติดตามแล้ว' : 'ติดตามผู้แต่ง' }}</Button>
      </div>
    </header>

    <p v-if="!author.stories.length" class="muted">ยังไม่มีเรื่องที่เผยแพร่</p>
    <div v-else class="shelf">
      <router-link v-for="s in author.stories" :key="s.id" :to="`/story/${s.id}`" class="book">
        <BookCover :title="s.title" :genre="s.genre" :image="s.coverImage" />
        <div class="line-clamp-2 mt-3 min-h-[2.75em] text-balance font-serif font-bold leading-snug">{{ s.title }}</div>
        <div class="muted mt-1 text-xs">{{ s.chapterCount }} ตอน<template v-if="s.mood"> · {{ s.mood }}</template></div>
        <RatingLine :rating="s.rating" :count="s.ratingCount" />
      </router-link>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { client, ok } from '../api'
import DocProse from '../components/DocProse.vue'
import Bar from '../components/ui/Bar.vue'
import { renderDoc } from '../infoDoc'
import { parseDb } from '../genre'
import { setTitle } from '../title'

// One page for terms, privacy, guide, about and contact: the text comes from the server (the admin's version, or the shipped default).
const props = defineProps<{ slug: 'terms' | 'privacy' | 'guide' | 'about' | 'contact' }>()
const router = useRouter()
const load = () => ok(client.api.pages({ slug: props.slug }).get())
const page = ref<Awaited<ReturnType<typeof load>> | null>(null), loading = ref(true), error = ref('')
const html = computed(() => (page.value ? renderDoc(page.value.body) : ''))
const updated = computed(() => parseDb(page.value?.updatedAt as string | undefined)?.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }))
const showDate = computed(() => props.slug === 'terms' || props.slug === 'privacy') // the two documents people agree to

watch(() => props.slug, async () => {
  loading.value = true; error.value = ''; page.value = null
  try { page.value = await load(); setTitle(page.value.title) } catch (e) { error.value = (e as Error).message }
  loading.value = false
}, { immediate: true })

// links the admin wrote as "/privacy" are in-app links: go there without reloading the site
function onClick(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest('a'), href = a?.getAttribute('href')
  if (!a || !href?.startsWith('/') || href.startsWith('//') || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
  e.preventDefault(); router.push(href)
}
</script>

<template>
  <Bar v-if="loading" />
  <p v-if="error" class="mx-auto max-w-[68ch] rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{{ error }}</p>
  <article v-if="page" class="mx-auto max-w-[68ch]">
    <h1 class="font-serif text-[clamp(26px,4vw,36px)] font-bold leading-snug">{{ page.title }}</h1>
    <p v-if="showDate && updated" class="muted mt-2 text-sm">ปรับปรุงล่าสุด {{ updated }}</p>
    <DocProse :html="html" class="mt-1" @click="onClick" />
  </article>
</template>

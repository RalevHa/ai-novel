<script setup lang="ts">
import { LEGAL } from '../legal'

withDefaults(defineProps<{ title: string; lead: string; updated?: boolean; contact?: boolean }>(), { updated: true, contact: true }) // a page can drop the "updated" line or the closing contact block
const dev = import.meta.env.DEV // only developers see the reminder below
</script>

<template>
  <article class="mx-auto max-w-[68ch] [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mb-2 [&_h2]:mt-9 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-bold [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_p]:leading-[1.85] [&_li]:leading-[1.85] [&_p]:text-fg/85 [&_li]:text-fg/85">
    <h1 class="font-serif text-[clamp(26px,4vw,36px)] font-bold leading-snug">{{ title }}</h1>
    <p v-if="updated" class="muted !mt-2 text-sm">ปรับปรุงล่าสุด {{ LEGAL.updated }}</p>
    <p>{{ lead }}</p>
    <slot />
    <template v-if="contact">
      <h2>ติดต่อเรา</h2>
      <p>
        {{ LEGAL.operator }}
        <template v-if="LEGAL.contactEmail">· <a :href="`mailto:${LEGAL.contactEmail}`">{{ LEGAL.contactEmail }}</a></template>
        · <router-link to="/contact">วิธีติดต่อทั้งหมด</router-link>
      </p>
    </template>
    <p v-if="!LEGAL.contactEmail && dev" class="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      ยังไม่ได้ตั้งอีเมลติดต่อ: ตั้ง VITE_CONTACT_EMAIL (และ VITE_OPERATOR_NAME) ก่อนเปิดใช้งานจริง
    </p>
  </article>
</template>

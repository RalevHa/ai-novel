<script setup lang="ts">
import { ShieldAlert } from 'lucide-vue-next'
import { confirmAge, ratingAge, warningTags, type ContentRating } from '../rating'
import Button from './ui/Button.vue'

// Shown in place of a 15+/18+ story's text until the reader says they are old enough. Not access control: nothing about age reaches the server.
const props = defineProps<{ rating: ContentRating; warnings?: string }>()
</script>

<template>
  <section class="mx-auto my-10 max-w-md rounded-xl border border-warning/50 bg-warning/10 p-6 text-center" aria-labelledby="age-gate-h">
    <ShieldAlert class="mx-auto size-9 text-warning" aria-hidden="true" />
    <h2 id="age-gate-h" class="mt-3 font-serif text-xl font-bold">เรื่องนี้สำหรับผู้อ่านอายุ {{ ratingAge(rating) }} ปีขึ้นไป</h2>
    <ul v-if="warningTags(warnings).length" class="mt-3 flex flex-wrap justify-center gap-2" aria-label="คำเตือนเนื้อหา">
      <li v-for="w in warningTags(warnings)" :key="w" class="rounded-full border border-warning/50 bg-surface px-2.5 py-0.5 text-xs">{{ w }}</li>
    </ul>
    <div class="mt-5 flex flex-col gap-2">
      <Button size="lg" @click="confirmAge(props.rating)">ฉันอายุ {{ ratingAge(rating) }} ปีขึ้นไป อ่านต่อ</Button>
      <Button variant="ghost" to="/story">กลับไปชั้นนิยาย</Button>
    </div>
    <p class="muted mt-4 text-xs">ระบบไม่เก็บข้อมูลอายุของคุณ จำคำตอบไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น</p>
  </section>
</template>

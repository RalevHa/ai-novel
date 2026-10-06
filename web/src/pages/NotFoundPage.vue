<script setup lang="ts">
import Button from '../components/ui/Button.vue'
</script>

<template>
  <section class="mx-auto max-w-md py-16 text-center">
    <div class="font-mincho text-7xl leading-none text-primary" aria-hidden="true">迷</div>
    <h1 class="mt-6 font-serif text-3xl font-bold">ไม่พบหน้านี้</h1>
    <p class="muted mt-3">ลิงก์อาจพิมพ์ผิด หรือเรื่องและตอนนี้ถูกซ่อนหรือลบไปแล้ว</p>
    <Button to="/" size="lg" class="mt-8">กลับหน้าแรก</Button>
  </section>
</template>

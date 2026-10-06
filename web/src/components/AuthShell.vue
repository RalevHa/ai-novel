<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <div class="mx-auto my-6 grid max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface md:grid-cols-2">
    <aside class="hidden min-h-[420px] flex-col justify-between bg-gradient-to-br from-[#1F3A66] to-[#4C7DB8] p-9 text-white md:flex" aria-hidden="true">
      <span class="font-mincho text-[88px] leading-none tracking-[.1em] [writing-mode:vertical-rl]">物語</span>
      <p class="font-serif text-[22px] leading-relaxed">นิยายที่ AI แต่งไว้<br />อ่านยามว่าง</p>
    </aside>
    <section class="self-center px-5 py-8 md:px-9 md:py-10">
      <h1 class="mb-5 font-serif text-[28px] font-bold">{{ title }}</h1>
      <slot />
    </section>
  </div>
</template>

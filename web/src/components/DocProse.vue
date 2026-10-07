<script setup lang="ts">
// Rendered Markdown of an info page, styled like body text. `html` comes from renderDoc (raw HTML is switched off there).
defineProps<{ html: string }>()
</script>

<template>
  <div class="[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-fg/10 [&_code]:px-1 [&_h2]:mb-2 [&_h2]:mt-9 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-bold [&_li]:mt-1.5 [&_li]:leading-[1.85] [&_li]:text-fg/85 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-3 [&_p]:leading-[1.85] [&_p]:text-fg/85 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6" v-html="html" />
</template>

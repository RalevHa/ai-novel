<script setup lang="ts">
defineProps<{ label?: string }>()
const model = defineModel<string>({ default: '' })
const id = `otp-${Math.random().toString(36).slice(2, 8)}`
// digits only, at most 6 (pasting "123 456" from the mail works)
const clean = (e: Event) => { const el = e.target as HTMLInputElement; model.value = el.value = el.value.replace(/\D/g, '').slice(0, 6) }
</script>

<template>
  <div class="mb-4">
    <label :for="id" class="mb-1.5 block text-sm font-medium">{{ label ?? 'รหัส 6 หลักจากอีเมล' }}</label>
    <input :id="id" :value="model" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="••••••" required pattern="\d{6}" aria-describedby="otp-hint" @input="clean"
      class="h-14 w-full rounded-lg border border-line bg-surface text-center font-mono text-[28px] font-bold tracking-[.4em] text-primary outline-none placeholder:text-fg/25 focus:border-primary focus:ring-2 focus:ring-primary/25" />
    <p id="otp-hint" class="mt-1 text-xs text-fg/75">รหัสใช้ได้ 10 นาที</p>
  </div>
</template>

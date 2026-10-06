<script setup lang="ts">
import { computed, ref } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'

const props = defineProps<{ label?: string; type?: string; hint?: string; autocomplete?: string; required?: boolean; placeholder?: string; minlength?: number }>()
const model = defineModel<string>()
const id = `f-${Math.random().toString(36).slice(2, 8)}`

// password fields get a show/hide button (typos in a hidden password are the usual sign-in problem on a phone)
const isPassword = computed(() => props.type === 'password')
const shown = ref(false)
</script>

<template>
  <div class="mb-4">
    <label v-if="label" :for="id" class="mb-1.5 block text-sm font-medium">{{ label }}</label>
    <div class="relative">
      <input :id="id" v-model="model" :type="isPassword && shown ? 'text' : type || 'text'" :autocomplete="autocomplete" :required="required" :placeholder="placeholder" :minlength="minlength"
        :class="['h-11 w-full rounded-lg border border-line bg-surface px-3 outline-none placeholder:text-fg/40 focus:border-primary focus:ring-2 focus:ring-primary/25', isPassword && 'pr-11']" />
      <button v-if="isPassword" type="button" class="absolute inset-y-0 right-0 grid w-11 place-items-center text-fg/60 hover:text-fg" :aria-label="shown ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'" :aria-pressed="shown" @click="shown = !shown">
        <EyeOff v-if="shown" class="size-5" aria-hidden="true" /><Eye v-else class="size-5" aria-hidden="true" />
      </button>
    </div>
    <p v-if="hint" class="mt-1 text-xs text-fg/75">{{ hint }}</p>
  </div>
</template>

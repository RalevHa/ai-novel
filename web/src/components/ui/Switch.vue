<script setup lang="ts">
import { Switch, SwitchGroup, SwitchLabel } from '@headlessui/vue'
defineProps<{ label?: string; disabled?: boolean }>()
const model = defineModel<boolean>()
</script>

<template>
  <SwitchGroup as="div" class="flex items-center gap-3">
    <Switch v-model="model" :disabled="disabled"
      :class="[model ? 'bg-primary' : 'bg-fg/25', 'hit inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50']">
      <span :class="[model ? 'translate-x-6' : 'translate-x-1', 'inline-block size-4 rounded-full bg-white shadow transition-transform']" />
    </Switch>
    <SwitchLabel v-if="label" class="cursor-pointer text-sm">{{ label }}</SwitchLabel>
  </SwitchGroup>
</template>

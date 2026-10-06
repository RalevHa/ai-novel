<script setup lang="ts">
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue'
import { X } from 'lucide-vue-next'

// size "lg" is full-screen on phones (long forms); "sm" stays a centred card (confirmations)
defineProps<{ open: boolean; title: string; size?: 'sm' | 'lg'; wide?: boolean }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <TransitionRoot :show="open" as="template">
    <Dialog class="relative z-50" @close="$emit('close')">
      <TransitionChild as="template" enter="duration-150 ease-out" enter-from="opacity-0" enter-to="opacity-100" leave="duration-100 ease-in" leave-from="opacity-100" leave-to="opacity-0">
        <div class="fixed inset-0 bg-black/50" aria-hidden="true" />
      </TransitionChild>
      <div :class="['fixed inset-0 flex', size === 'sm' ? 'items-center justify-center p-4' : 'sm:items-center sm:justify-center sm:p-4']">
        <TransitionChild as="template" enter="duration-150 ease-out" enter-from="opacity-0 scale-95" enter-to="opacity-100 scale-100" leave="duration-100 ease-in" leave-from="opacity-100 scale-100" leave-to="opacity-0 scale-95">
          <DialogPanel :class="['flex w-full flex-col bg-surface shadow-xl', size === 'sm' ? 'max-h-[90dvh] max-w-md rounded-xl border border-line' : 'h-dvh sm:h-auto sm:max-h-[92dvh] sm:rounded-xl sm:border sm:border-line', wide ? 'sm:max-w-4xl' : 'sm:max-w-2xl']">
            <header class="flex items-center gap-2 px-5 pb-3 pt-5">
              <DialogTitle class="flex-1 font-serif text-lg font-bold">{{ title }}</DialogTitle>
              <button type="button" class="grid size-9 place-items-center rounded-lg hover:bg-fg/5" aria-label="ปิด" @click="$emit('close')"><X class="size-5" /></button>
            </header>
            <div class="flex-1 overflow-y-auto px-5 pb-4 pt-1"><slot /></div>
            <footer v-if="$slots.footer" class="flex justify-end gap-2 border-t border-line px-5 py-3"><slot name="footer" /></footer>
          </DialogPanel>
        </TransitionChild>
      </div>
    </Dialog>
  </TransitionRoot>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/vue'
import { Check, ChevronDown } from 'lucide-vue-next'
import { stripChapterPrefix } from '../genre'

const props = defineProps<{ chapters: { no: number; title: string }[]; up?: boolean }>() // up: open above (for pickers at the bottom of a page)
const model = defineModel<number>()

const label = (c: { no: number; title: string }) => `${c.no}. ${stripChapterPrefix(c.title) || `ตอนที่ ${c.no}`}`
const current = computed(() => props.chapters.find(c => c.no === model.value))
</script>

<template>
  <Listbox v-model="model" as="div" class="relative min-w-0">
    <ListboxButton :aria-label="`เลือกตอน ${current ? label(current) : ''}`"
      class="flex h-10 w-full items-center rounded-lg border border-line bg-surface pl-3 pr-9 text-left text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25">
      <span class="truncate">{{ current ? label(current) : '' }}</span>
      <ChevronDown class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg/60" aria-hidden="true" />
    </ListboxButton>
    <transition enter-active-class="transition duration-100 ease-out" enter-from-class="scale-95 opacity-0" enter-to-class="scale-100 opacity-100" leave-active-class="transition duration-75 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <ListboxOptions :class="['absolute z-40 max-h-72 w-full min-w-[220px] overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg focus:outline-none', up ? 'bottom-full mb-1' : 'mt-1']">
        <ListboxOption v-for="c in chapters" :key="c.no" v-slot="{ active, selected }" :value="c.no" as="template">
          <li :class="['flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm', active && 'bg-fg/10', selected && 'font-medium text-primary']">
            <span class="min-w-0 flex-1 truncate">{{ label(c) }}</span>
            <Check v-if="selected" class="size-4 shrink-0" aria-hidden="true" />
          </li>
        </ListboxOption>
      </ListboxOptions>
    </transition>
  </Listbox>
</template>

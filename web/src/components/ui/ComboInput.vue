<script setup lang="ts">
import { computed, ref } from 'vue'
import { Combobox, ComboboxButton, ComboboxInput, ComboboxLabel, ComboboxOption, ComboboxOptions } from '@headlessui/vue'
import { Check, ChevronDown } from 'lucide-vue-next'

// A text field with suggestions: any text is accepted, the list only helps. Replaces <input list> / <datalist>, whose popup the browser draws.
const props = defineProps<{ label?: string; hint?: string; options: readonly string[]; placeholder?: string }>()
const model = defineModel<string>({ default: '' })
const toggle = ref<InstanceType<typeof ComboboxButton> | null>(null)

// show everything when the field is empty or already holds a suggestion; otherwise narrow by what was typed
const shown = computed(() => {
  const q = model.value.trim().toLowerCase()
  return !q || props.options.includes(model.value) ? props.options : props.options.filter(o => o.toLowerCase().includes(q))
})
</script>

<template>
  <Combobox v-slot="{ open }" v-model="model" as="div" class="mb-4" nullable>
    <!-- ComboboxLabel (not <label for>): the combobox names its input through aria-labelledby, which would otherwise point at the toggle button -->
    <ComboboxLabel v-if="label" class="mb-1.5 block text-sm font-medium">{{ label }}</ComboboxLabel>
    <div class="relative">
      <ComboboxInput :display-value="() => model" :placeholder="placeholder" autocomplete="off"
        class="h-11 w-full rounded-lg border border-line bg-surface pl-3 pr-10 outline-none placeholder:text-fg/40 focus:border-primary focus:ring-2 focus:ring-primary/25"
        @input="model = ($event.target as HTMLInputElement).value"
        @click="!open && (toggle?.$el as HTMLElement).click()" /><!-- a datalist opens on click; the headless combobox only opens from its button or on typing -->
      <ComboboxButton ref="toggle" class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-fg/60" aria-label="แสดงตัวเลือก"><ChevronDown class="size-4" aria-hidden="true" /></ComboboxButton>
      <transition enter-active-class="transition duration-100 ease-out" enter-from-class="scale-95 opacity-0" enter-to-class="scale-100 opacity-100" leave-active-class="transition duration-75 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
        <ComboboxOptions v-if="shown.length" class="absolute z-40 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg focus:outline-none">
          <ComboboxOption v-for="o in shown" :key="o" v-slot="{ active, selected }" :value="o" as="template">
            <li :class="['flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm', active && 'bg-fg/10', selected && 'font-medium text-primary']">
              <span class="min-w-0 flex-1 truncate">{{ o }}</span>
              <Check v-if="selected" class="size-4 shrink-0" aria-hidden="true" />
            </li>
          </ComboboxOption>
        </ComboboxOptions>
      </transition>
    </div>
    <p v-if="hint" class="mt-1 text-xs text-fg/65">{{ hint }}</p>
  </Combobox>
</template>

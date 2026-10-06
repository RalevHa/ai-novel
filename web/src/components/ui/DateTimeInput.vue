<script setup lang="ts">
import { computed, ref } from 'vue'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/vue'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import Button from './Button.vue'

// Date + time picker drawn by us (the browser's <input type="datetime-local"> popup cannot be themed).
// The value has the same shape as that input's: "YYYY-MM-DDTHH:mm" in local time, '' when unset.
defineProps<{ label?: string; hint?: string }>()
const model = defineModel<string>({ default: '' })

const pad = (n: number) => String(n).padStart(2, '0')
const cur = computed(() => {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/.exec(model.value)
  return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3], h: +m[4], mi: +m[5] } : null
})
const set = (y: number, mo: number, d: number, h: number, mi: number) => { model.value = `${y}-${pad(mo + 1)}-${pad(d)}T${pad(h)}:${pad(mi)}` }

const text = computed(() => cur.value
  ? new Date(cur.value.y, cur.value.mo, cur.value.d, cur.value.h, cur.value.mi).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '')

// month on show: the chosen date's, else this month
const today = new Date()
const view = ref({ y: cur.value?.y ?? today.getFullYear(), m: cur.value?.mo ?? today.getMonth() })
const shift = (by: number) => { const d = new Date(view.value.y, view.value.m + by, 1); view.value = { y: d.getFullYear(), m: d.getMonth() } }
const title = computed(() => new Date(view.value.y, view.value.m, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }))
const days = computed(() => {
  const lead = new Date(view.value.y, view.value.m, 1).getDay() // Sunday first
  const n = new Date(view.value.y, view.value.m + 1, 0).getDate()
  return [...Array(lead).fill(0), ...Array.from({ length: n }, (_, i) => i + 1)] as number[]
})
const isSel = (d: number) => !!cur.value && cur.value.y === view.value.y && cur.value.mo === view.value.m && cur.value.d === d
const isToday = (d: number) => today.getFullYear() === view.value.y && today.getMonth() === view.value.m && today.getDate() === d

// a time of day is kept when the date changes; the first pick defaults to 08:00
const pick = (d: number) => set(view.value.y, view.value.m, d, cur.value?.h ?? 8, cur.value?.mi ?? 0)
const clamp = (v: unknown, max: number) => Math.min(max, Math.max(0, Math.trunc(Number(v)) || 0))
const setTime = (part: 'h' | 'mi', v: unknown) => {
  const c = cur.value ?? { y: view.value.y, mo: view.value.m, d: today.getDate(), h: 8, mi: 0 }
  set(c.y, c.mo, c.d, part === 'h' ? clamp(v, 23) : c.h, part === 'mi' ? clamp(v, 59) : c.mi)
}
const id = `f-${Math.random().toString(36).slice(2, 8)}`
</script>

<template>
  <div class="mb-4">
    <label v-if="label" :for="id" class="mb-1.5 block text-sm font-medium">{{ label }}</label>
    <Popover class="relative">
      <PopoverButton :id="id" class="flex h-11 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 text-left outline-none focus:border-primary focus:ring-2 focus:ring-primary/25">
        <CalendarDays class="size-4 shrink-0 text-fg/60" aria-hidden="true" />
        <span :class="['truncate', !text && 'text-fg/40']">{{ text || 'ไม่ตั้งเวลา' }}</span>
      </PopoverButton>
      <transition enter-active-class="transition duration-100 ease-out" enter-from-class="scale-95 opacity-0" enter-to-class="scale-100 opacity-100" leave-active-class="transition duration-75 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
        <PopoverPanel v-slot="{ close }" class="absolute z-40 mt-1 w-72 rounded-xl border border-line bg-surface p-3 shadow-lg">
          <div class="mb-2 flex items-center">
            <Button variant="ghost" size="icon" class="size-8" aria-label="เดือนก่อนหน้า" @click="shift(-1)"><ChevronLeft class="size-4" /></Button>
            <div class="flex-1 text-center text-sm font-medium">{{ title }}</div>
            <Button variant="ghost" size="icon" class="size-8" aria-label="เดือนถัดไป" @click="shift(1)"><ChevronRight class="size-4" /></Button>
          </div>
          <div class="grid grid-cols-7 text-center text-xs text-fg/60">
            <span v-for="w in ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']" :key="w" class="py-1">{{ w }}</span>
          </div>
          <div class="grid grid-cols-7 gap-y-0.5 text-center text-sm">
            <template v-for="(d, i) in days" :key="i">
              <span v-if="!d" />
              <button v-else type="button"
                :class="['mx-auto grid size-9 place-items-center rounded-full transition-colors', isSel(d) ? 'bg-primary text-on-primary' : 'hover:bg-fg/10', !isSel(d) && isToday(d) && 'ring-1 ring-primary']"
                :aria-label="`${d} ${title}`" :aria-pressed="isSel(d)" @click="pick(d)">{{ d }}</button>
            </template>
          </div>
          <div class="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm">
            <span class="text-fg/65">เวลา</span>
            <input type="number" min="0" max="23" inputmode="numeric" aria-label="ชั่วโมง" :value="pad(cur?.h ?? 8)" class="h-9 w-14 rounded-lg border border-line bg-surface px-2 text-center outline-none focus:border-primary" @change="setTime('h', ($event.target as HTMLInputElement).value)" />
            <span>:</span>
            <input type="number" min="0" max="59" inputmode="numeric" aria-label="นาที" :value="pad(cur?.mi ?? 0)" class="h-9 w-14 rounded-lg border border-line bg-surface px-2 text-center outline-none focus:border-primary" @change="setTime('mi', ($event.target as HTMLInputElement).value)" />
          </div>
          <!-- own row: time + both buttons do not fit in the 18 rem panel on one line -->
          <div class="mt-3 flex items-center justify-between">
            <Button size="sm" variant="ghost" :disabled="!model" @click="model = ''">ล้าง</Button>
            <Button size="sm" @click="close()">ตกลง</Button>
          </div>
        </PopoverPanel>
      </transition>
    </Popover>
    <p v-if="hint" class="mt-1 text-xs text-fg/65">{{ hint }}</p>
  </div>
</template>

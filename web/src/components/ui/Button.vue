<script setup lang="ts">
import { computed } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import { cn } from './cn'

const props = withDefaults(defineProps<{
  variant?: 'solid' | 'outline' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg' | 'icon'
  to?: string; href?: string; type?: 'button' | 'submit'; loading?: boolean; disabled?: boolean
}>(), { variant: 'solid', size: 'md', type: 'button' })

const cls = computed(() => cn(
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
  { solid: 'bg-primary text-on-primary hover:bg-primary/90', outline: 'border border-line hover:bg-fg/5', ghost: 'hover:bg-fg/5', danger: 'bg-danger text-white hover:bg-danger/90' }[props.variant],
  { sm: 'h-11 px-3 text-sm sm:h-8', md: 'h-10 px-4', lg: 'h-12 px-6 text-base', icon: 'size-11 sm:size-10' }[props.size],
))
</script>

<template>
  <router-link v-if="to" :to="to" :class="cls"><slot /></router-link>
  <a v-else-if="href" :href="href" download :class="cls"><slot /></a> <!-- plain link: a file download, not a route -->
  <button v-else :type="type" :class="cls" :disabled="disabled || loading">
    <Loader2 v-if="loading" class="size-4 animate-spin" aria-hidden="true" /><slot />
  </button>
</template>

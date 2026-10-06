<script setup lang="ts">
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue'
import type { Component } from 'vue'

export type MenuEntry = { label: string; icon?: Component; to?: string; danger?: boolean; action?: () => void }
defineProps<{ items: MenuEntry[]; label: string; align?: 'left' | 'right'; heading?: string; sub?: string }>()
</script>

<template>
  <Menu as="div" class="relative inline-block text-left" @click.stop>
    <MenuButton as="template"><slot name="button" :label="label" /></MenuButton>
    <transition enter-active-class="transition duration-100 ease-out" enter-from-class="scale-95 opacity-0" enter-to-class="scale-100 opacity-100" leave-active-class="transition duration-75 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <MenuItems :class="['absolute z-40 mt-1 w-56 rounded-xl border border-line bg-surface p-1 shadow-lg focus:outline-none', align === 'left' ? 'left-0' : 'right-0']">
        <div v-if="heading" class="mb-1 border-b border-line px-3 pb-2 pt-1.5"><div class="truncate text-sm font-medium">{{ heading }}</div><div class="truncate text-xs text-fg/75">{{ sub }}</div></div>
        <MenuItem v-for="it in items" :key="it.label" v-slot="{ active }" as="template">
          <router-link v-if="it.to" :to="it.to" :class="['flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm', active && 'bg-fg/10', it.danger && 'text-danger']">
            <component :is="it.icon" v-if="it.icon" class="size-4" />{{ it.label }}
          </router-link>
          <button v-else type="button" :class="['flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm', active && 'bg-fg/10', it.danger && 'text-danger']" @click="it.action?.()">
            <component :is="it.icon" v-if="it.icon" class="size-4" />{{ it.label }}
          </button>
        </MenuItem>
      </MenuItems>
    </transition>
  </Menu>
</template>

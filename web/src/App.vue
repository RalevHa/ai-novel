<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BookmarkCheck, ExternalLink, LibraryBig, LogOut, Moon, Settings, Sun, UserRound, Users } from 'lucide-vue-next'
import Button from './components/ui/Button.vue'
import DropMenu, { type MenuEntry } from './components/ui/DropMenu.vue'
import Toaster from './components/ui/Toaster.vue'
import { useAuth } from './stores/auth'
import { isDark, toggleTheme } from './theme'

const auth = useAuth(), route = useRoute(), router = useRouter()
const inAdmin = computed(() => route.path.startsWith('/admin'))

async function logout() {
  await auth.logout()
  router.push('/')
}
const menu = computed<MenuEntry[]>(() => [
  ...(auth.canWrite ? [{ label: 'จัดการนิยาย', icon: Settings, to: '/admin/stories' }] : []),
  { label: 'เรื่องที่ติดตาม', icon: BookmarkCheck, to: '/following' },
  { label: 'โปรไฟล์ของฉัน', icon: UserRound, to: '/profile' },
  { label: 'ออกจากระบบ', icon: LogOut, action: logout },
])
const nav = computed(() => [
  { to: '/admin/stories', label: 'นิยาย', icon: LibraryBig },
  ...(auth.isAdmin ? [{ to: '/admin/users', label: 'ผู้ใช้', icon: Users }] : []), // writers manage stories only
])
const link = 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-fg/5'
// a plain #main anchor would make the router navigate; focus the landmark instead
const skipToMain = () => { const m = document.getElementById('main'); m?.focus(); m?.scrollIntoView() }
</script>

<template>
  <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lg" @click.prevent="skipToMain">ข้ามไปเนื้อหา</a>
  <!-- admin shell: side rail on desktop, top bar + bottom nav on phones -->
  <div v-if="inAdmin" class="min-h-dvh md:pl-56">
    <aside class="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-line bg-surface p-3 md:flex">
      <router-link to="/" class="mb-3 flex items-center gap-3 p-2" aria-label="จัดการ ไปหน้าอ่าน"><span class="seal" aria-hidden="true" /><span class="font-medium">จัดการ</span></router-link>
      <nav class="flex flex-col gap-1">
        <router-link v-for="n in nav" :key="n.to" :to="n.to" :class="link" active-class="bg-primary/10 font-medium text-primary"><component :is="n.icon" class="size-5" />{{ n.label }}</router-link>
      </nav>
      <div class="mt-auto flex flex-col gap-1">
        <router-link to="/" :class="link"><ExternalLink class="size-5" />ดูหน้าอ่าน</router-link>
        <button type="button" :class="link" @click="toggleTheme"><Sun v-if="isDark" class="size-5" /><Moon v-else class="size-5" />{{ isDark ? 'ธีมสว่าง' : 'ธีมมืด' }}</button>
        <button type="button" :class="link" @click="logout"><LogOut class="size-5" />ออกจากระบบ</button>
      </div>
    </aside>

    <header class="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 md:hidden">
      <span class="seal" aria-hidden="true" /><span class="flex-1 font-medium">จัดการ</span>
      <Button variant="ghost" size="icon" :aria-label="isDark ? 'ธีมสว่าง' : 'ธีมมืด'" @click="toggleTheme"><Sun v-if="isDark" class="size-5" /><Moon v-else class="size-5" /></Button>
      <Button variant="ghost" size="icon" aria-label="ออกจากระบบ" @click="logout"><LogOut class="size-5" /></Button>
    </header>

    <main id="main" tabindex="-1" class="mx-auto max-w-[1000px] px-4 pb-24 pt-6 outline-none md:px-8 md:pb-10 md:pt-8"><router-view /></main>

    <nav class="fixed inset-x-0 bottom-0 z-30 grid h-16 auto-cols-fr grid-flow-col border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="เมนูจัดการ">
      <router-link v-for="n in nav" :key="n.to" :to="n.to" class="flex flex-col items-center justify-center gap-1 text-xs text-fg/75" active-class="!text-primary font-medium"><component :is="n.icon" class="size-5" />{{ n.label }}</router-link>
      <router-link to="/" class="flex flex-col items-center justify-center gap-1 text-xs text-fg/75"><ExternalLink class="size-5" />หน้าอ่าน</router-link>
    </nav>
  </div>

  <!-- public shell -->
  <template v-else>
    <header class="site-header sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
      <div class="wrap flex h-[60px] items-center gap-2">
        <router-link to="/" class="hit flex items-center gap-3" aria-label="AI Novel หน้าแรก">
          <span class="seal" aria-hidden="true" /><span class="hidden font-serif text-lg font-bold sm:inline">AI Novel</span>
        </router-link>
        <div class="flex-1" />
        <Button variant="ghost" size="icon" :aria-label="isDark ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด'" @click="toggleTheme"><Sun v-if="isDark" class="size-5" /><Moon v-else class="size-5" /></Button>
        <DropMenu v-if="auth.user" :items="menu" label="บัญชี" :heading="auth.user.name" :sub="auth.user.email">
          <template #button="{ label }">
            <button type="button" class="grid size-9 place-items-center rounded-full bg-primary font-medium text-on-primary" :aria-label="label">{{ auth.user.name.slice(0, 1).toUpperCase() }}</button>
          </template>
        </DropMenu>
        <Button v-else-if="auth.ready" to="/login" variant="outline">เข้าสู่ระบบ</Button>
      </div>
    </header>
    <main id="main" tabindex="-1" class="wrap pb-12 pt-6 outline-none"><router-view /></main>
    <footer class="wrap pb-8 text-xs muted">นิยายทั้งหมดเขียนโดย AI สำหรับอ่านเล่นยามว่าง</footer>
  </template>

  <Toaster />
</template>

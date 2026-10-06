import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from './stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./pages/HomePage.vue') },
    { path: '/story/:id', component: () => import('./pages/StoryPage.vue') },
    { path: '/story/:id/read/:no', component: () => import('./pages/ReadPage.vue') },
    { path: '/login', component: () => import('./pages/LoginPage.vue') },
    { path: '/register', component: () => import('./pages/RegisterPage.vue') },
    { path: '/admin/stories', component: () => import('./pages/AdminStories.vue'), meta: { admin: true } },
    { path: '/admin/users', component: () => import('./pages/AdminUsers.vue'), meta: { admin: true } },
    { path: '/admin/stories/:id', component: () => import('./pages/AdminStory.vue'), meta: { admin: true } },
  ],
})

router.beforeEach(async to => {
  const auth = useAuth()
  if (!auth.ready) await auth.load()
  if (to.meta.admin && !auth.isAdmin) return { path: '/login', query: { next: to.fullPath } }
  if (auth.user && (to.path === '/login' || to.path === '/register')) return '/'
})

export default router

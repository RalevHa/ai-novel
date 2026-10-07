import { createRouter, createWebHistory } from 'vue-router'
import { setTitle } from './title'
import { useAuth } from './stores/auth'

declare module 'vue-router' { interface RouteMeta { admin?: boolean; staff?: boolean; user?: boolean; title?: string } }

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./pages/HomePage.vue') },
    { path: '/story/:id', component: () => import('./pages/StoryPage.vue') },
    { path: '/story/:id/read/:no', component: () => import('./pages/ReadPage.vue') },
    { path: '/login', component: () => import('./pages/LoginPage.vue'), meta: { title: 'เข้าสู่ระบบ' } },
    { path: '/register', component: () => import('./pages/RegisterPage.vue'), meta: { title: 'สมัครสมาชิก' } },
    { path: '/author/:id', component: () => import('./pages/AuthorPage.vue') },
    { path: '/following', component: () => import('./pages/FollowingPage.vue'), meta: { user: true, title: 'เรื่องที่ติดตาม' } },
    { path: '/profile', component: () => import('./pages/ProfilePage.vue'), meta: { user: true, title: 'โปรไฟล์ของฉัน' } },
    { path: '/admin/stories', component: () => import('./pages/AdminStories.vue'), meta: { staff: true, title: 'จัดการนิยาย' } },
    { path: '/admin/users', component: () => import('./pages/AdminUsers.vue'), meta: { admin: true, title: 'จัดการผู้ใช้' } },
    { path: '/admin/stories/:id', component: () => import('./pages/AdminStory.vue'), meta: { staff: true } },
    { path: '/:pathMatch(.*)*', component: () => import('./pages/NotFoundPage.vue'), meta: { title: 'ไม่พบหน้านี้' } },
  ],
})

router.beforeEach(async to => {
  const auth = useAuth()
  if (!auth.ready) await auth.load()
  if ((to.meta.user && !auth.user) || (to.meta.staff && !auth.canWrite) || (to.meta.admin && !auth.isAdmin)) return { path: '/login', query: { next: to.fullPath } }
  if (auth.user && (to.path === '/login' || to.path === '/register')) return '/'
})

// pages that know their own name (story, chapter) set it again once their data has loaded
router.afterEach(to => setTitle(to.meta.title))

export default router

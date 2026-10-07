import { createRouter, createWebHistory, START_LOCATION } from 'vue-router'
import { setTitle } from './title'
import { useAuth } from './stores/auth'

declare module 'vue-router' { interface RouteMeta { admin?: boolean; staff?: boolean; user?: boolean; title?: string } }

const router = createRouter({
  history: createWebHistory(),
  // A new page starts at the top (the footer links used to leave you at the bottom); back/forward return to where you were.
  scrollBehavior(to, _from, saved) {
    if (/^\/story\/\d+\/read\//.test(to.path)) return false // the reader page puts you where you stopped reading, or at the top, by itself
    if (to.hash) return { el: to.hash, top: 80 }
    // pages fill in after fetching their data, so give them a moment before returning to a saved position
    if (saved) return new Promise(resolve => setTimeout(() => resolve(saved), 250))
    return { top: 0 }
  },
  routes: [
    { path: '/', component: () => import('./pages/LandingPage.vue') },
    { path: '/story', component: () => import('./pages/StoryListPage.vue'), meta: { title: 'นิยายทั้งหมด' } },
    { path: '/story/:id', component: () => import('./pages/StoryPage.vue') },
    { path: '/story/:id/read/:no', component: () => import('./pages/ReadPage.vue') },
    { path: '/guide', component: () => import('./pages/InfoPage.vue'), props: { slug: 'guide' }, meta: { title: 'คู่มือการใช้งาน' } },
    { path: '/about', component: () => import('./pages/InfoPage.vue'), props: { slug: 'about' }, meta: { title: 'เกี่ยวกับเรา' } },
    { path: '/contact', component: () => import('./pages/InfoPage.vue'), props: { slug: 'contact' }, meta: { title: 'ติดต่อเรา' } },
    { path: '/terms', component: () => import('./pages/InfoPage.vue'), props: { slug: 'terms' }, meta: { title: 'ข้อกำหนดการใช้งาน' } },
    { path: '/privacy', component: () => import('./pages/InfoPage.vue'), props: { slug: 'privacy' }, meta: { title: 'นโยบายความเป็นส่วนตัว' } },
    { path: '/login', component: () => import('./pages/LoginPage.vue'), meta: { title: 'เข้าสู่ระบบ' } },
    { path: '/register', component: () => import('./pages/RegisterPage.vue'), meta: { title: 'สมัครสมาชิก' } },
    { path: '/verify', component: () => import('./pages/VerifyEmailPage.vue'), meta: { title: 'ยืนยันอีเมล' } },
    { path: '/forgot', component: () => import('./pages/ForgotPasswordPage.vue'), meta: { title: 'ลืมรหัสผ่าน' } },
    { path: '/author/:id', component: () => import('./pages/AuthorPage.vue') },
    { path: '/following', component: () => import('./pages/FollowingPage.vue'), meta: { user: true, title: 'เรื่องที่ติดตาม' } },
    { path: '/notifications', component: () => import('./pages/NotificationsPage.vue'), meta: { user: true, title: 'การแจ้งเตือน' } },
    { path: '/profile', component: () => import('./pages/ProfilePage.vue'), meta: { user: true, title: 'โปรไฟล์ของฉัน' } },
    { path: '/admin/stories', component: () => import('./pages/AdminStories.vue'), meta: { staff: true, title: 'จัดการนิยาย' } },
    { path: '/admin/reports', component: () => import('./pages/AdminReports.vue'), meta: { admin: true, title: 'รายงานความคิดเห็น' } },
    { path: '/admin/site', component: () => import('./pages/AdminSite.vue'), meta: { admin: true, title: 'ตั้งค่าเว็บไซต์' } },
    { path: '/admin/users', component: () => import('./pages/AdminUsers.vue'), meta: { admin: true, title: 'จัดการผู้ใช้' } },
    { path: '/admin/stories/:id', component: () => import('./pages/AdminStory.vue'), meta: { staff: true } },
    { path: '/:pathMatch(.*)*', component: () => import('./pages/NotFoundPage.vue'), meta: { title: 'ไม่พบหน้านี้' } },
  ],
})

router.beforeEach(async (to, from) => {
  const auth = useAuth()
  if (!auth.ready) await auth.load()
  if ((to.meta.user && !auth.user) || (to.meta.staff && !auth.canWrite) || (to.meta.admin && !auth.isAdmin)) return { path: '/login', query: { next: to.fullPath } }
  // someone who is signed in and just opened the site goes straight to the novels; clicking the logo later still shows the landing page
  if (auth.user && to.path === '/' && from === START_LOCATION) return '/story'
  if (auth.user && (to.path === '/login' || to.path === '/register')) return '/story'
})

// pages that know their own name (story, chapter) set it again once their data has loaded
router.afterEach(to => setTitle(to.meta.title))

export default router

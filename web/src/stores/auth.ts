import { defineStore } from 'pinia'
import { client, ok } from '../api'
import { prefsSignedIn, syncPrefs } from '../prefs'
import { setViewAs, viewAs } from '../viewAs'

export type Role = 'admin' | 'writer' | 'user'
export type User = { id: number; email: string; name: string; role: Role; bio?: string }

export const useAuth = defineStore('auth', {
  state: () => ({ user: null as User | null, ready: false }),
  getters: {
    // the role the pages should act on: an admin looking at the site as someone else (viewAs.ts) gets that role's menus and routes
    role(s): Role | undefined { return s.user?.role === 'admin' && viewAs.value ? viewAs.value : s.user?.role },
    isAdmin(): boolean { return this.role === 'admin' },
    canWrite(): boolean { return this.role === 'admin' || this.role === 'writer' },
    realAdmin: s => s.user?.role === 'admin',
    previewing: s => s.user?.role === 'admin' && !!viewAs.value,
    // the server marks what an admin may delete; in a preview only the admin's own items stay deletable, as for a reader
    canRemove() { return (flag: boolean, ownerId: number) => flag && (!this.previewing || ownerId === this.user?.id) },
  },
  actions: {
    async load() {
      this.user = (await client.api.auth.me.get().catch(() => null))?.data ?? null
      if (this.user?.role !== 'admin') setViewAs(null)
      if (this.user) await syncPrefs()
      this.ready = true
    },
    async login(email: string, password: string) {
      this.user = await ok(client.api.auth.login.post({ email, password }))
      if (this.user.role !== 'admin') setViewAs(null)
      await syncPrefs()
    },
    /** Creates the account and mails a code; there is no session until verify() succeeds. */
    async register(email: string, name: string, password: string) {
      await ok(client.api.auth.register.post({ email, name, password, acceptTerms: true }))
    },
    async verify(email: string, code: string) {
      this.user = await ok(client.api.auth.verify.post({ email, code }))
      setViewAs(null)
      await syncPrefs()
    },
    async logout() {
      await ok(client.api.auth.logout.post())
      this.user = null
      setViewAs(null)
      prefsSignedIn(false)
    },
  },
})

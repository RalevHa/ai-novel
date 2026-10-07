import { defineStore } from 'pinia'
import { client, ok } from '../api'

export type Role = 'admin' | 'writer' | 'user'
export type User = { id: number; email: string; name: string; role: Role; bio?: string }

export const useAuth = defineStore('auth', {
  state: () => ({ user: null as User | null, ready: false }),
  getters: { isAdmin: s => s.user?.role === 'admin', canWrite: s => s.user?.role === 'admin' || s.user?.role === 'writer' },
  actions: {
    async load() {
      this.user = (await client.api.auth.me.get().catch(() => null))?.data ?? null
      this.ready = true
    },
    async login(email: string, password: string) {
      this.user = await ok(client.api.auth.login.post({ email, password }))
    },
    async register(email: string, name: string, password: string) {
      this.user = await ok(client.api.auth.register.post({ email, name, password, acceptTerms: true }))
    },
    async logout() {
      await ok(client.api.auth.logout.post())
      this.user = null
    },
  },
})

import { defineStore } from 'pinia'
import { client, ok } from '../api'
import { useAuth } from './auth'

// Writers the signed-in reader follows (new stories reach the bell). Empty for visitors.
export const useAuthorFollows = defineStore('authorFollows', {
  state: () => ({ ids: [] as number[], loaded: false }),
  actions: {
    async load() {
      if (!useAuth().user) { this.ids = []; this.loaded = false; return }
      if (this.loaded) return
      try { this.ids = await ok(client.api.me['author-follows'].get()); this.loaded = true } catch { /* the button just shows "follow" */ }
    },
    has(authorId: number) { return this.ids.includes(authorId) },
    /** Follow / unfollow. The mark flips at once and is put back if the server refuses. */
    async toggle(authorId: number) {
      const on = !this.has(authorId)
      this.ids = on ? [authorId, ...this.ids] : this.ids.filter(i => i !== authorId)
      try { await ok(on ? client.api.me['author-follows']({ id: authorId }).put() : client.api.me['author-follows']({ id: authorId }).delete()) }
      catch (e) { this.ids = on ? this.ids.filter(i => i !== authorId) : [authorId, ...this.ids]; throw e }
    },
  },
})

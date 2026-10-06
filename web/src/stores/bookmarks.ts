import { defineStore } from 'pinia'
import { client, ok } from '../api'
import { useAuth } from './auth'

// Stories the signed-in reader follows ("my shelf"). Empty for visitors.
export const useBookmarks = defineStore('bookmarks', {
  state: () => ({ ids: [] as number[], loaded: false }),
  actions: {
    async load() {
      if (!useAuth().user) { this.ids = []; this.loaded = false; return }
      if (this.loaded) return
      try { this.ids = await ok(client.api.me.bookmarks.get()); this.loaded = true } catch { /* the shelf just shows no marks */ }
    },
    has(storyId: number) { return this.ids.includes(storyId) },
    /** Follow / unfollow. The mark flips at once and is put back if the server refuses. */
    async toggle(storyId: number) {
      const on = !this.has(storyId)
      this.ids = on ? [storyId, ...this.ids] : this.ids.filter(i => i !== storyId)
      try { await ok(on ? client.api.me.bookmarks({ id: storyId }).put() : client.api.me.bookmarks({ id: storyId }).delete()) }
      catch (e) { this.ids = on ? this.ids.filter(i => i !== storyId) : [storyId, ...this.ids]; throw e }
    },
  },
})

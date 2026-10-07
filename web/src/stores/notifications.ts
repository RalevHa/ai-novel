import { defineStore } from 'pinia'
import { client, ok } from '../api'
import { useAuth } from './auth'

// How many replies / upvotes the signed-in reader has not looked at yet (the bell badge). Checked every minute while the tab is visible.
let timer: ReturnType<typeof setInterval> | undefined

export const useNotifications = defineStore('notifications', {
  state: () => ({ unread: 0 }),
  actions: {
    async refresh() {
      if (!useAuth().user) { this.unread = 0; return }
      try { this.unread = (await ok(client.api.me.notifications.count.get())).unread } catch { /* the bell just keeps its last number */ }
    },
    start() {
      this.stop()
      this.refresh()
      timer = setInterval(() => { if (!document.hidden) this.refresh() }, 60_000)
    },
    stop() { clearInterval(timer); timer = undefined; this.unread = 0 },
  },
})

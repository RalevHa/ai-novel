// localStorage can throw (private mode, blocked data); reading UI must still render
export const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
export const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {} }

import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { db } from './db'
import { NAME_RE, removeUpload, UPLOAD_DIR } from './uploads'

/** Delete uploaded files that no cover, portrait or chapter refers to any more (call after the referencing row changed). */
export async function pruneUnused(names: string[]) {
  for (const name of names) {
    const used = await db.execute(sql`select 1 where exists (select 1 from stories where cover_image = ${name})
      or exists (select 1 from characters where image = ${name})
      or exists (select 1 from chapters where position(${name} in content) > 0)`)
    if (!used.length) await removeUpload(name)
  }
}

/** Files uploaded in the editor but never saved into a chapter (dialog cancelled, tab closed) are cleaned up once they are old enough. */
export async function sweepOrphans(minAgeMs = 60 * 60 * 1000) {
  for (const name of await readdir(UPLOAD_DIR)) {
    if (!NAME_RE.test(name)) continue
    if (Date.now() - (await stat(join(UPLOAD_DIR, name))).mtimeMs < minAgeMs) continue
    await pruneUnused([name])
  }
}

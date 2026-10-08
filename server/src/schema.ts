import { sql } from 'drizzle-orm'
import { type AnyPgColumn, boolean, check, doublePrecision, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, unique } from 'drizzle-orm/pg-core'

/** Reading settings that follow the account across devices (the web keeps its own copy in localStorage). Every field is optional: unset = the device default. */
export type ReaderPrefs = { theme?: 'paper' | 'sepia' | 'ink'; fontSize?: number; fontFace?: 'serif' | 'sans'; measure?: 'narrow' | 'normal' | 'wide'; leading?: 'tight' | 'normal' | 'loose' }

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'writer', 'user'] }).notNull().default('user'), // writer: can write stories of their own; only an admin can grant it
  bio: text('bio').notNull().default(''), // shown on the author page
  prefs: jsonb('prefs').$type<ReaderPrefs>().notNull().default({}),
  suspendedAt: timestamp('suspended_at'), // set by an admin: cannot sign in and existing sessions stop working; null = active
  passwordChangedAt: timestamp('password_changed_at'), // a session token issued before this is refused, so a reset or change signs every other device out; null = never changed
  emailVerifiedAt: timestamp('email_verified_at'), // when they proved the address with a one-time code; null = cannot sign in yet (accounts that existed before this column were marked verified)
  termsAcceptedAt: timestamp('terms_accepted_at'), // when they ticked the terms + privacy box at sign-up; null = account made before that (or by the admin seed)
  notificationsSeenAt: timestamp('notifications_seen_at'), // new-chapter items count toward the bell badge only when released after this
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// One live one-time code per user and purpose (a new request replaces the old one). Only an HMAC of the code is stored.
export const emailCodes = pgTable('email_codes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  purpose: text('purpose', { enum: ['verify', 'reset', 'change', 'delete'] }).notNull(),
  email: text('email').notNull(), // the address the code was sent to (the new one, for 'change')
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [unique('email_codes_user_purpose_key').on(t.userId, t.purpose)])

export const stories = pgTable('stories', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  synopsis: text('synopsis').notNull().default(''),
  genre: text('genre').notNull().default(''),
  mood: text('mood').notNull().default(''),
  premise: text('premise').notNull().default(''), // plot/characters fed to the AI
  systemPrompt: text('system_prompt').notNull().default(''),
  outline: text('outline').notNull().default(''), // one planned chapter per line; "✓ " marks the ones already written
  model: text('model').notNull().default(''),
  coverImage: text('cover_image').notNull().default(''), // file name in the uploads dir; empty = generated cover
  published: boolean('published').notNull().default(false),
  status: text('status', { enum: ['ongoing', 'completed'] }).notNull().default('ongoing'), // shown to readers: still being written, or finished
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const chapters = pgTable('chapters', {
  id: serial('id').primaryKey(),
  storyId: integer('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  no: integer('no').notNull(),
  title: text('title').notNull().default(''),
  content: text('content').notNull(),
  summary: text('summary').notNull().default(''), // short recap fed to the AI as context for later chapters
  instruction: text('instruction').notNull().default(''),
  model: text('model').notNull().default(''),
  published: boolean('published').notNull().default(false), // AI writes a draft, admin publishes
  publishAt: timestamp('publish_at'), // set + published = goes live at this time (UTC); null = live as soon as published
  releasedAt: timestamp('released_at'), // when it went (or goes) live for readers, see release.ts; null = hidden. "New chapter" notifications compare against this
  views: integer('views').notNull().default(0), // anonymous count of times readers opened the chapter (no user, no IP stored)
  finishes: integer('finishes').notNull().default(0), // ...and of times they scrolled to the end
  tokens: integer('tokens'), // total tokens spent writing + summarising; null = unknown (older chapters, or the stream stopped before OpenRouter reported usage)
  cost: doublePrecision('cost'), // USD (OpenRouter credits), same caveat as tokens
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [unique('chapters_story_no_key').on(t.storyId, t.no)])

export const characters = pgTable('characters', {
  id: serial('id').primaryKey(),
  storyId: integer('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role').notNull().default(''), // e.g. protagonist, rival
  profile: text('profile').notNull().default(''), // looks, personality, speech style, relationships: fed to the AI every chapter
  image: text('image').notNull().default(''), // file name in the uploads dir
  visible: boolean('visible').notNull().default(true), // shown to readers on the story page
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [index('characters_story_id_idx').on(t.storyId)])

// where each signed-in reader stopped, so "continue reading" follows them across devices
export const readingProgress = pgTable('reading_progress', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  storyId: integer('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  no: integer('no').notNull(),
  pos: doublePrecision('pos'), // how far down chapter `no` the reader got (0-1 of its scroll height); null = start
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.storyId] })])

// chapters a signed-in reader has finished: the table of contents ticks them off
export const chapterReads = pgTable('chapter_reads', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  storyId: integer('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  no: integer('no').notNull(),
  readAt: timestamp('read_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.storyId, t.no] })])

// the text a chapter had before each overwrite, so a bad edit or rewrite can be undone
export const chapterVersions = pgTable('chapter_versions', {
  id: serial('id').primaryKey(),
  chapterId: integer('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [index('chapter_versions_chapter_id_idx').on(t.chapterId, t.id)])

// stories a signed-in reader follows ("my shelf")
export const bookmarks = pgTable('bookmarks', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  storyId: integer('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.storyId] })])

// who changed what (role grants for now); actorId is null if that account is ever removed
export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetId: integer('target_id').references(() => users.id, { onDelete: 'set null' }),
  detail: text('detail').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// comments on one chapter; replies go one level deep (a reply to a reply is stored under the top-level comment)
export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  storyId: integer('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  chapterId: integer('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: integer('parent_id').references((): AnyPgColumn => comments.id, { onDelete: 'cascade' }), // null = top-level
  body: text('body').notNull(),
  editedAt: timestamp('edited_at'), // set when the author edits the text; null = never edited
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [index('comments_chapter_idx').on(t.chapterId, t.id), index('comments_parent_idx').on(t.parentId)])

// one vote per reader per comment: +1 up, -1 down (removing a vote deletes the row)
export const commentVotes = pgTable('comment_votes', {
  commentId: integer('comment_id').notNull().references(() => comments.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  value: integer('value').notNull(),
}, t => [primaryKey({ columns: [t.commentId, t.userId] }), check('comment_votes_value', sql`${t.value} in (-1, 1)`)])

// community reviews of a whole story: one per reader (they can edit it), a 1-5 star rating plus optional text
export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  storyId: integer('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull(),
  body: text('body').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [unique('reviews_story_user_key').on(t.storyId, t.userId), check('reviews_rating_range', sql`${t.rating} between 1 and 5`)])

// reviews can be voted up/down (+1/-1, one per reader; removing a vote deletes the row) and answered with flat replies
export const reviewVotes = pgTable('review_votes', {
  reviewId: integer('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  value: integer('value').notNull(),
}, t => [primaryKey({ columns: [t.reviewId, t.userId] }), check('review_votes_value', sql`${t.value} in (-1, 1)`)])

export const reviewReplies = pgTable('review_replies', {
  id: serial('id').primaryKey(),
  reviewId: integer('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [index('review_replies_review_idx').on(t.reviewId, t.id)])

// "someone replied to you" / "your comment got an upvote". One row per (recipient, kind, comment): a new upvote on the same comment
// just marks its row unread again; the score shown is read live from the comment
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['reply', 'vote'] }).notNull(),
  actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }), // who replied; null for votes (voters stay anonymous)
  commentId: integer('comment_id').notNull().references(() => comments.id, { onDelete: 'cascade' }), // the reply itself, or the comment that was voted on
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [unique('notifications_user_type_comment_key').on(t.userId, t.type, t.commentId), index('notifications_user_idx').on(t.userId, t.id)])

// readers flag comments for the admins; one open report per reader per comment, dismissed or acted on from /admin/reports
export const commentReports = pgTable('comment_reports', {
  id: serial('id').primaryKey(),
  commentId: integer('comment_id').notNull().references(() => comments.id, { onDelete: 'cascade' }),
  reporterId: integer('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at'), // null = still waiting for an admin
}, t => [unique('comment_reports_comment_reporter_key').on(t.commentId, t.reporterId), index('comment_reports_open_idx').on(t.resolvedAt)])

// site-wide settings the admin can change without a rebuild (operator name, contact email); a missing key falls back to the server env, then a default
export const siteSettings = pgTable('site_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Terms, privacy, guide, about and contact (Markdown). A row only exists once an admin has edited the page; without one the page shows the
// default text shipped in pageDefaults.ts, so deleting the row is "back to the default"
export const infoPages = pgTable('info_pages', {
  slug: text('slug').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
})

// every saved version of an info page, so a bad edit can be looked up and put back
export const infoPageRevisions = pgTable('info_page_revisions', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  editorId: integer('editor_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [index('info_page_revisions_slug_idx').on(t.slug, t.id)])

// A writer's own OpenRouter key, encrypted (see secrets.ts) and bound to their user id; the only place a key is stored. Never selected into responses:
// the UI only learns "set" and the last 4 characters.
export const userAiKeys = pgTable('user_ai_keys', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  ciphertext: text('ciphertext').notNull(),
  last4: text('last4').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Every call to a model and what it cost, so the monthly cap can count only what the site's own key paid for ('site') and not what writers paid with theirs ('own').
export const aiUsage = pgTable('ai_usage', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  source: text('source', { enum: ['site', 'own'] }).notNull(),
  kind: text('kind').notNull(), // generate | rewrite | summary | check | suggest | earlier (spend recorded before this table existed)
  model: text('model').notNull().default(''),
  tokens: integer('tokens').notNull().default(0),
  cost: doublePrecision('cost').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [index('ai_usage_source_created_idx').on(t.source, t.createdAt)])

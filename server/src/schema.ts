import { boolean, doublePrecision, index, integer, pgTable, primaryKey, serial, text, timestamp, unique } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

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
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.storyId] })])

// the text a chapter had before each overwrite, so a bad edit or rewrite can be undone
export const chapterVersions = pgTable('chapter_versions', {
  id: serial('id').primaryKey(),
  chapterId: integer('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [index('chapter_versions_chapter_id_idx').on(t.chapterId, t.id)])

import { boolean, index, integer, pgTable, serial, text, timestamp, unique } from 'drizzle-orm/pg-core'

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

/** The header the browser sends with every AI request: the writer's own OpenRouter key, kept only in their browser. */
export const AI_KEY_HEADER = 'x-ai-key'

/** The key in a header value, or undefined when it is missing or not a plausible key (so the request is treated as having no key). */
export function parseAiKey(value: string | null | undefined) {
  const key = value?.trim()
  return key && /^\S{20,200}$/.test(key) ? key : undefined
}

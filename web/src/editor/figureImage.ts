import Image from '@tiptap/extension-image'
import { IMAGE_ALIGNS, IMAGE_WIDTHS, parseImageSrc } from '../markdown'

// Block image with width, alignment and a caption. It renders the same <figure> the reader renders (same CSS classes),
// and serialises to  ![alt](/api/uploads/x.webp#w=50&a=left "caption").
const imgOf = (el: HTMLElement) => (el.tagName === 'IMG' ? el : el.querySelector('img'))

export const FigureImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: { default: null, parseHTML: (el: HTMLElement) => parseImageSrc(imgOf(el)?.getAttribute('src') ?? '').path || null },
      alt: { default: 'ภาพประกอบ', parseHTML: (el: HTMLElement) => imgOf(el)?.getAttribute('alt') ?? '' },
      title: { default: null, parseHTML: (el: HTMLElement) => (el.tagName === 'IMG' ? el.getAttribute('title') : el.querySelector('figcaption')?.textContent) || null },
      width: { default: null as number | null, parseHTML: (el: HTMLElement) => parseImageSrc(imgOf(el)?.getAttribute('src') ?? '').width },
      align: { default: 'center', parseHTML: (el: HTMLElement) => parseImageSrc(imgOf(el)?.getAttribute('src') ?? '').align },
    }
  },

  parseHTML() {
    return [{ tag: 'figure.fig' }, { tag: 'img[src]' }]
  },

  renderHTML({ node }) {
    const { src, alt, title, width, align } = node.attrs
    const kids: unknown[] = [['img', { src, alt }]]
    if (title) kids.push(['figcaption', title])
    return ['figure', { class: `fig fig-w${width ?? 'auto'} fig-${align}` }, ...kids] as any
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const { src, alt, title, width, align } = node.attrs
          const p = new URLSearchParams()
          if ((IMAGE_WIDTHS as readonly number[]).includes(width)) p.set('w', String(width))
          if (align !== 'center' && (IMAGE_ALIGNS as readonly string[]).includes(align)) p.set('a', align)
          const frag = p.toString()
          const cleanAlt = String(alt ?? '').replace(/[[\]\n]/g, ' ').trim()
          const caption = String(title ?? '').replace(/"/g, '”').replace(/\s*\n\s*/g, ' ').trim() // no raw quotes: they would end the title early
          state.write(`![${cleanAlt}](${src}${frag ? '#' + frag : ''}${caption ? ` "${caption}"` : ''})`)
          state.closeBlock(node) // images are blocks: always separated by a blank line
        },
        parse: {},
      },
    }
  },
})

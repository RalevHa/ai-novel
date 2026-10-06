import { createPinia } from 'pinia'
import { createApp } from 'vue'
// fonts are bundled (no request to Google): Plex Sans Thai for UI, Noto Serif Thai for reading, Shippori Mincho for the kanji on covers
import '@fontsource/ibm-plex-sans-thai/400.css'
import '@fontsource/ibm-plex-sans-thai/500.css'
import '@fontsource/ibm-plex-sans-thai/600.css'
import '@fontsource/noto-serif-thai/400.css'
import '@fontsource/noto-serif-thai/500.css'
import '@fontsource/noto-serif-thai/600.css'
import '@fontsource/noto-serif-thai/700.css'
import './fonts-mincho.css'
import './styles.css'
import './theme'
import App from './App.vue'
import router from './router'

createApp(App).use(createPinia()).use(router).mount('#app')

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}

interface ImportMetaEnv {
  /** '1' builds the public site (front page, guides, tour) instead of the dashboard. */
  readonly VITE_HANGAR_SITE?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}

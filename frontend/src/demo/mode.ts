import { ref } from 'vue'

/**
 * Which build this is (D40). The dashboard is installed on each person's own server. The site
 * (`VITE_HANGAR_SITE=1`, published at hangar.benduffaut.com) is static: the front page, the
 * guides, and the tour, which shows the real dashboard under /tour with sample data from
 * demo/data.ts. The site has no server; nothing in it calls an API.
 */
export const IS_SITE = import.meta.env.VITE_HANGAR_SITE === '1'

/** Dashboard pages on the site live under /tour. */
export const TOUR_BASE = '/tour'

/** The tour's sample data answers every call. Only ever true on the site. */
export const isDemo = () => IS_SITE

/** The install prompt: what the visitor tried to do, or 'tour-done' after the last tour step. */
export const signUpPrompt = ref<string | null>(null)
export const askToSignUp = (reason: string) => (signUpPrompt.value = reason)

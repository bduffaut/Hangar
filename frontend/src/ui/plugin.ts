import type { App } from 'vue'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'
import { DARK_CLASS } from '../theme/css.ts'
import { hangarPreset } from '../theme/preset.ts'

/**
 * Installs the component library. This folder (ui/) is the only place that knows which library
 * renders the Base* components; replacing it means rewriting these files, not the app.
 */
export function installUi(app: App): void {
  app.use(PrimeVue, {
    theme: {
      preset: hangarPreset,
      options: {
        darkModeSelector: `.${DARK_CLASS}`,
        prefix: 'p',
        // Our own styles win over the library's without !important.
        cssLayer: { name: 'primevue', order: 'primevue, hangar' },
      },
    },
  })
  app.use(ToastService)
  app.use(ConfirmationService)
  app.directive('hint', Tooltip)
}

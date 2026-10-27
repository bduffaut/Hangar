import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { installDashboardPlugins } from './dashboard/index.ts'
import { router } from './router.ts'
import './theme/base.css'
import { installThemeVariables } from './theme/css.ts'
import { installUi } from './ui/index.ts'

installThemeVariables()
installDashboardPlugins()

const app = createApp(App)
app.use(createPinia())
app.use(router)
installUi(app)
app.mount('#app')

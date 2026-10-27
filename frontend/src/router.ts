import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from './stores/session.ts'

declare module 'vue-router' {
  interface RouteMeta {
    /** Reachable without signing in. */
    public?: boolean
    /** Shown inside the app frame (header and navigation). */
    shell?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes: [
    {
      path: '/setup',
      name: 'setup',
      component: () => import('./views/SetupView.vue'),
      meta: { public: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'home',
      component: () => import('./views/HomeView.vue'),
      meta: { shell: true },
    },
    {
      path: '/projects/new',
      name: 'new-project',
      component: () => import('./views/NewProjectView.vue'),
      meta: { shell: true },
    },
    {
      path: '/projects/:name/:tab?',
      name: 'project',
      component: () => import('./views/ProjectView.vue'),
      meta: { shell: true },
    },
    {
      path: '/deployments/:id',
      name: 'deployment',
      component: () => import('./views/DeploymentView.vue'),
      meta: { shell: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('./views/SettingsView.vue'),
      meta: { shell: true },
    },
    {
      path: '/guide',
      name: 'guide',
      component: () => import('./views/GuideView.vue'),
      meta: { shell: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('./views/NotFoundView.vue'),
      meta: { shell: true, public: true },
    },
  ],
})

// After an update, an open tab may ask for code files that no longer exist. Load the page fresh
// (once) instead of failing silently.
router.onError((error, to) => {
  const message = error instanceof Error ? error.message : String(error)
  if (/dynamically imported module|Importing a module script failed|module script/i.test(message)) {
    if (sessionStorage.getItem('hangar.reloaded') !== to.fullPath) {
      sessionStorage.setItem('hangar.reloaded', to.fullPath)
      window.location.assign(to.fullPath)
    }
  }
})

// Until the first account exists every page leads to setup; after that, pages need a session.
router.beforeEach(async (to) => {
  const session = useSessionStore()
  await session.load()
  if (session.needsSetup && to.name !== 'setup') return { name: 'setup' }
  if (to.name === 'setup' && !session.needsSetup && !session.signedIn) return { name: 'login' }
  if (to.name === 'login' && session.signedIn) return { name: 'home' }
  if (!to.meta.public && !session.signedIn) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { next: to.fullPath } }
  }
})

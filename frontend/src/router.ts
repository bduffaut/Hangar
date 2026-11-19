import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { IS_SITE, TOUR_BASE } from './demo/mode.ts'
import { useSessionStore } from './stores/session.ts'

declare module 'vue-router' {
  interface RouteMeta {
    /** Reachable without signing in. */
    public?: boolean
    /** Shown inside the app frame (header and navigation). */
    shell?: boolean
    /** Needs the admin role. The server enforces this; here it only keeps people off dead pages. */
    admin?: boolean
  }
}

/** The dashboard's pages. On the site they live under /tour, filled with the sample hangar. */
const dashboard: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('./views/HomeView.vue'),
    meta: { shell: true },
  },
  {
    // First steps, in order: your other devices, GitHub, the internet, a first app.
    path: '/start',
    name: 'start',
    component: () => import('./views/StartView.vue'),
    meta: { shell: true },
  },
  {
    path: '/publish',
    name: 'publish',
    component: () => import('./views/PublishView.vue'),
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
    path: '/settings/:section?',
    name: 'settings',
    component: () => import('./views/SettingsView.vue'),
    meta: { shell: true, admin: true },
  },
  {
    path: '/people',
    // GitHub comes back to the alias after creating the app (see UsersView).
    alias: '/people/github-app',
    name: 'users',
    component: () => import('./views/UsersView.vue'),
    meta: { shell: true, admin: true },
  },
  {
    // Ready-made apps, and any published image (D42). Admins only, as the server enforces.
    path: '/apps',
    name: 'apps',
    component: () => import('./views/AppsView.vue'),
    meta: { shell: true, admin: true },
  },
  {
    path: '/apps/:id',
    name: 'app-install',
    component: () => import('./views/AppInstallView.vue'),
    meta: { shell: true, admin: true },
  },
  {
    path: '/account',
    name: 'account',
    component: () => import('./views/AccountView.vue'),
    meta: { shell: true },
  },
  {
    path: '/guide',
    name: 'guide',
    component: () => import('./views/GuideView.vue'),
    meta: { shell: true },
  },
]

/** Signing in on a person's own Hangar. */
const signIn: RouteRecordRaw[] = [
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
    // The token is in the #fragment, which browsers never send to any server.
    path: '/invite',
    name: 'link',
    component: () => import('./views/LinkView.vue'),
    meta: { public: true },
  },
  {
    // GitHub sends people back here after they authorize the app, with a code and the state.
    path: '/auth/github',
    name: 'github-callback',
    component: () => import('./views/GithubCallbackView.vue'),
    meta: { public: true },
  },
]

/** The public site's own pages: the front door and the guides. */
const site: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'welcome',
    component: () => import('./views/LandingView.vue'),
    meta: { public: true },
  },
  {
    path: '/docs/:slug?',
    name: 'docs',
    component: () => import('./views/DocsView.vue'),
    meta: { public: true },
  },
  { path: '/install', redirect: { name: 'docs', params: { slug: 'install' } } },
  {
    path: '/privacy',
    name: 'privacy',
    component: () => import('./views/LegalView.vue'),
    meta: { public: true },
  },
]

const notFound: RouteRecordRaw = {
  path: '/:pathMatch(.*)*',
  name: 'not-found',
  component: () => import('./views/NotFoundView.vue'),
  meta: { public: true },
}

const underTour = (route: RouteRecordRaw): RouteRecordRaw => ({
  ...route,
  path: route.path === '/' ? TOUR_BASE : `${TOUR_BASE}${route.path}`,
  ...('alias' in route && typeof route.alias === 'string'
    ? { alias: `${TOUR_BASE}${route.alias}` }
    : {}),
})

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (to, _from, saved) => saved ?? (to.hash ? { el: to.hash, top: 80 } : { top: 0 }),
  routes: IS_SITE
    ? [...site, ...dashboard.map(underTour), notFound]
    : [...signIn, ...dashboard, { ...notFound, meta: { shell: true, public: true } }],
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
// The site has no accounts: its tour is always "signed in" to the sample hangar.
router.beforeEach(async (to) => {
  const session = useSessionStore()
  await session.load()
  if (IS_SITE) return true
  // App.vue shows a retry screen; let the navigation finish so the address bar is right.
  if (session.unreachable) return true
  if (session.needsSetup && to.name !== 'setup') return { name: 'setup' }
  if (to.name === 'setup' && !session.needsSetup && !session.signedIn) return { name: 'login' }
  if (to.name === 'login' && session.signedIn) return { name: 'home' }
  if (!to.meta.public && !session.signedIn) {
    return to.fullPath === '/' ? { name: 'login' } : { name: 'login', query: { next: to.fullPath } }
  }
  if (to.meta.admin && !session.isAdmin) return { name: 'home' }
})

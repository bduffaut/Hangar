import { createRouter, createWebHistory } from 'vue-router'
import { useServersStore } from './stores/servers.ts'
import { useSessionStore } from './stores/session.ts'

declare module 'vue-router' {
  interface RouteMeta {
    /** Reachable without signing in. */
    public?: boolean
    /** Shown inside the app frame (header and navigation). */
    shell?: boolean
    /** Needs the admin role. The server enforces this; here it only keeps people off dead pages. */
    admin?: boolean
    /** About the chosen server's apps: needs a server to show. */
    server?: boolean
    /** The chosen server's settings: admins here, and anyone on a server of their own. */
    serverAdmin?: boolean
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
      // The front door for visitors: what Hangar is, and how to start.
      path: '/welcome',
      name: 'welcome',
      component: () => import('./views/LandingView.vue'),
      meta: { public: true },
    },
    {
      // This machine is someone's own server: its dashboard lives on the Hangar it is run from.
      path: '/managed',
      name: 'managed',
      component: () => import('./views/ManagedView.vue'),
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
    {
      path: '/',
      name: 'home',
      component: () => import('./views/HomeView.vue'),
      meta: { shell: true, server: true },
    },
    {
      // First steps, in order: a server, GitHub, the internet, a first app.
      path: '/start',
      name: 'start',
      component: () => import('./views/StartView.vue'),
      meta: { shell: true },
    },
    {
      path: '/servers',
      name: 'servers',
      component: () => import('./views/ServersView.vue'),
      meta: { shell: true },
    },
    {
      path: '/publish',
      name: 'publish',
      component: () => import('./views/PublishView.vue'),
      meta: { shell: true, server: true },
    },
    {
      path: '/projects/new',
      name: 'new-project',
      component: () => import('./views/NewProjectView.vue'),
      meta: { shell: true, server: true },
    },
    {
      path: '/projects/:name/:tab?',
      name: 'project',
      component: () => import('./views/ProjectView.vue'),
      meta: { shell: true, server: true },
    },
    {
      path: '/deployments/:id',
      name: 'deployment',
      component: () => import('./views/DeploymentView.vue'),
      meta: { shell: true, server: true },
    },
    {
      path: '/settings/:section?',
      name: 'settings',
      component: () => import('./views/SettingsView.vue'),
      meta: { shell: true, server: true, serverAdmin: true },
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
  // App.vue shows a retry screen; let the navigation finish so the address bar is right.
  if (session.unreachable) return true
  if (session.managedBy) return to.name === 'managed' ? true : { name: 'managed' }
  if (session.needsSetup && to.name !== 'setup') return { name: 'setup' }
  if (to.name === 'setup' && !session.needsSetup && !session.signedIn) return { name: 'login' }
  if ((to.name === 'login' || to.name === 'welcome') && session.signedIn) return { name: 'home' }
  if (!to.meta.public && !session.signedIn) {
    if (to.fullPath === '/') return { name: 'welcome' }
    return { name: 'login', query: { next: to.fullPath } }
  }
  if (!session.signedIn) return true
  const servers = useServersStore()
  if (!servers.loaded) await servers.load(session.localAccess)
  if (to.meta.server && !servers.hasServer) return { name: 'start' }
  if (to.meta.admin && !session.isAdmin) return { name: 'home' }
  if (to.meta.serverAdmin && servers.isLocal && !session.isAdmin) return { name: 'home' }
})

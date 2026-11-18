// The sample hangar shown on the tour (/tour): two servers, a handful of apps, two weeks of
// deployments, and one deploy that keeps happening while you watch. Everything lives in this
// module; nothing is sent anywhere. Shapes follow the API contract exactly, so the real dashboard
// renders it unchanged.
import type {
  AccountView,
  AddressView,
  DeploymentView,
  FlightStats,
  LogLineView,
  MetricsSample,
  ProjectView,
  Session,
  SettingsView,
  SystemInfo,
} from '@hangar/shared'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const now = () => Date.now()
const iso = (ms: number) => new Date(ms).toISOString()

/** A stable, valid UUID for sample record `n` of a kind. */
function uuid(kind: number, n: number): string {
  const hex = (kind * 0x10000 + n).toString(16).padStart(12, '0')
  return `00000000-0000-4000-8000-${hex}`
}

/** A deterministic pseudo-random sequence, so the sample looks the same on every visit. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const LAN_IP = '100.88.12.34'
const LAN_DOMAIN = `${LAN_IP.replaceAll('.', '-')}.sslip.io`
const DOMAIN = 'example.com'

export const demoSession: Session = {
  user: { id: uuid(1, 1), username: 'you', role: 'admin' },
  csrfToken: 'tour',
}

interface Seed {
  name: string
  repo: string
  hostnames: string[]
  stopped?: boolean
  framework: string
  commits: string[]
}

const SEEDS: Seed[] = [
  {
    name: 'portfolio',
    repo: 'you/portfolio',
    hostnames: [DOMAIN, `www.${DOMAIN}`],
    framework: 'Vite',
    commits: [
      'Add the new case study',
      'Tighten spacing on small screens',
      'Swap the hero photo',
      'Fix the contact form link',
      'Dark mode for the project pages',
    ],
  },
  {
    name: 'recipes-api',
    repo: 'you/recipes-api',
    hostnames: [`api.${DOMAIN}`],
    framework: 'Node.js',
    commits: [
      'Cache search results for a minute',
      'Add pagination to /recipes',
      'Upgrade to Node 24',
      'Return 404 for missing recipes',
      'Log slow queries',
    ],
  },
  {
    name: 'blog',
    repo: 'you/blog',
    hostnames: [`blog.${DOMAIN}`],
    framework: 'Astro',
    commits: [
      'Post: what I learned self-hosting',
      'Add an RSS feed',
      'Fix image sizes in posts',
      'Post: a year with a home server',
      'Syntax highlighting for code blocks',
    ],
  },
  {
    name: 'discord-bot',
    repo: 'you/discord-bot',
    hostnames: [],
    stopped: true,
    framework: 'Python',
    commits: ['Add the /weather command', 'Reconnect after network drops', 'Pin dependencies'],
  },
]

interface ProjectRecord {
  view: Omit<ProjectView, 'current' | 'latest' | 'recent'>
  seed: Seed
  deployments: DeploymentView[]
}

const sha = (r: () => number) =>
  Array.from({ length: 40 }, () => Math.floor(r() * 16).toString(16)).join('')

function buildProjects(): ProjectRecord[] {
  const random = seeded(7)
  let deploymentSeq = 0
  return SEEDS.map((seed, index) => {
    const id = uuid(3, index + 1)
    const createdAt = now() - (20 + index * 3) * DAY
    const deployments: DeploymentView[] = []
    const count = seed.stopped ? 5 : 9 + index * 2
    let at = createdAt
    for (let n = 1; n <= count; n++) {
      at += ((now() - 2 * HOUR - at) / (count - n + 1)) * (0.6 + random() * 0.4)
      // recipes-api's newest build failed: the previous version keeps running, which is the point.
      const failed = (seed.name === 'recipes-api' && n === count) || (n > 2 && random() < 0.12)
      const seconds = 25 + Math.floor(random() * 70)
      deployments.push({
        id: uuid(4, ++deploymentSeq),
        projectId: id,
        number: n,
        commitSha: sha(random),
        commitMessage: seed.commits[(count - n) % seed.commits.length]!,
        commitAuthor: 'you',
        branch: 'main',
        status: failed ? 'failed' : 'ready',
        failureCode: failed ? 'build_failed' : null,
        failureReason: failed ? 'The build command exited with code 1.' : null,
        trigger: n === 1 ? 'manual' : random() < 0.8 ? 'push' : 'manual',
        sourceDeploymentId: null,
        port: seed.framework === 'Node.js' ? 8080 : 3000,
        isCurrent: false,
        createdAt: iso(at),
        startedAt: iso(at + 2000),
        finishedAt: iso(at + 2000 + seconds * 1000),
      })
    }
    const lastReady = deployments.findLast((d) => d.status === 'ready')
    if (lastReady) lastReady.isCurrent = true
    const addresses: AddressView[] = seed.hostnames.map((hostname) => ({
      hostname,
      url: `https://${hostname}`,
      status: 'live',
      message: null,
      checkedAt: iso(now() - 40_000),
      lastLiveAt: iso(now() - 40_000),
    }))
    return {
      seed,
      deployments,
      view: {
        id,
        name: seed.name,
        repoUrl: `https://github.com/${seed.repo}`,
        branch: 'main',
        rootDir: '',
        port: null,
        memoryLimitMb: 512,
        triggerMode: index === 1 ? 'webhook' : 'poll',
        desiredState: seed.stopped ? 'stopped' : 'running',
        url: `http://${seed.name}.${LAN_DOMAIN}`,
        hostnames: seed.hostnames,
        publicUrls: seed.hostnames.map((h) => `https://${h}`),
        addresses,
        createdAt: iso(createdAt),
      },
    }
  })
}

const projects = buildProjects()

function toView(record: ProjectRecord): ProjectView {
  const list = record.deployments
  return {
    ...record.view,
    current: list.find((d) => d.isCurrent) ?? null,
    latest: list.at(-1) ?? null,
    recent: list.slice(-12).map((d) => ({ id: d.id, number: d.number, status: d.status })),
  }
}

export const demoProjects = () => projects.map(toView)
export const demoProject = (id: string) => {
  const record = projects.find((p) => p.view.id === id)
  return record ? toView(record) : null
}
export const demoDeployments = (projectId: string, limit = 20) =>
  (projects.find((p) => p.view.id === projectId)?.deployments ?? []).slice(-limit).reverse()
export const demoDeployment = (id: string) =>
  projects.flatMap((p) => p.deployments).find((d) => d.id === id) ?? null
export const isRunning = (projectId: string) =>
  projects.find((p) => p.view.id === projectId)?.view.desiredState === 'running'

export function demoStats(): FlightStats {
  const all = projects.flatMap((p) => p.deployments)
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = iso(now() - (13 - i) * DAY).slice(0, 10)
    const that = all.filter((d) => d.createdAt.slice(0, 10) === date)
    return {
      date,
      ready: that.filter((d) => d.status === 'ready').length,
      failed: that.filter((d) => d.status === 'failed').length,
    }
  })
  const week = all.filter((d) => Date.parse(d.createdAt) > now() - 7 * DAY)
  const durations = all
    .filter((d) => d.status === 'ready' && d.startedAt && d.finishedAt)
    .slice(-30)
    .map((d) => (Date.parse(d.finishedAt!) - Date.parse(d.startedAt!)) / 1000)
    .sort((a, b) => a - b)
  return {
    days,
    deploys7d: week.length,
    ready7d: week.filter((d) => d.status === 'ready').length,
    failed7d: week.filter((d) => d.status === 'failed').length,
    medianDeploySeconds: durations[Math.floor(durations.length / 2)] ?? null,
    lastDeployAt:
      all
        .map((d) => d.createdAt)
        .sort()
        .at(-1) ?? null,
  }
}

export const demoSystemInfo: SystemInfo = {
  version: '0.3.0',
  imageDiskBytes: 3.4 * 1024 ** 3,
  cpuModel: 'Intel(R) Core(TM) i5-8350U CPU @ 1.70GHz',
  cpuThreads: 8,
  kernel: '6.8.0-48-generic',
  hostname: 'thinkpad',
  os: 'Ubuntu 24.04.1 LTS',
}

export const demoSettings: SettingsView = {
  lanIp: LAN_IP,
  lanDomain: LAN_DOMAIN,
  publicDomains: [DOMAIN],
  defaultDomain: DOMAIN,
  githubConnected: true,
  tunnelConfigured: true,
  towerUrl: `http://tower.${LAN_DOMAIN}`,
  privateUrl: 'https://hangar.tail1234.ts.net',
}

export const demoAccount: AccountView = {
  hasPassword: false,
  githubApp: null,
  github: { connected: true, kind: 'app', login: 'you' },
}

export const demoUsers = [
  {
    id: demoSession.user.id,
    username: 'you',
    role: 'admin' as const,
    projectCount: 4,
    createdAt: iso(now() - 30 * DAY),
  },
  {
    id: uuid(1, 2),
    username: 'sam',
    role: 'member' as const,
    projectCount: 0,
    createdAt: iso(now() - 6 * DAY),
  },
]

export const demoRepos = [
  ...SEEDS.map((s, i) => ({
    fullName: s.repo,
    url: `https://github.com/${s.repo}`,
    private: i % 2 === 1,
    defaultBranch: 'main',
    updatedAt: iso(now() - (i + 1) * 5 * HOUR),
  })),
  {
    fullName: 'you/weekend-project',
    url: 'https://github.com/you/weekend-project',
    private: false,
    defaultBranch: 'main',
    updatedAt: iso(now() - 3 * DAY),
  },
  {
    fullName: 'you/dotfiles',
    url: 'https://github.com/you/dotfiles',
    private: true,
    defaultBranch: 'master',
    updatedAt: iso(now() - 12 * DAY),
  },
]

export const demoEnvKeys = ['DATABASE_URL', 'NODE_ENV', 'SESSION_SECRET']

// Build logs: what a deployment's Flight Recorder shows.

function buildLog(d: DeploymentView): string[] {
  const record = projects.find((p) => p.view.id === d.projectId)
  const framework = record?.seed.framework ?? 'Node.js'
  const lines = [
    `Cloning ${record?.view.repoUrl ?? 'the repository'} (main)`,
    `Checked out ${d.commitSha.slice(0, 7)}: ${d.commitMessage ?? ''}`,
    'No Dockerfile found; detecting the framework with Railpack',
    `Detected ${framework}`,
    '#1 [internal] load build definition',
    '#2 [install] npm ci',
    '#2 added 312 packages in 9s',
    '#3 [build] npm run build',
    `#3 ${framework === 'Astro' ? 'astro build' : 'vite build'}`,
    '#3 ✓ 214 modules transformed.',
    '#3 ✓ built in 3.81s',
  ]
  if (d.status === 'failed') {
    return [
      ...lines.slice(0, 8),
      '#3 Error: Cannot find module "./routes/search.js"',
      '#3 ERROR: process "npm run build" did not complete successfully: exit code: 1',
      'Build failed. The version that was already running keeps running.',
    ]
  }
  return [
    ...lines,
    '#4 exporting to image',
    `Image hangar/${record?.view.name}:${d.number}-${d.commitSha.slice(0, 7)} built`,
    'Starting the new version next to the old one',
    `Waiting for it to answer on port ${d.port ?? 3000}`,
    'It answered with 200 OK',
    'Traffic moved to the new version',
    'Stopped the previous version',
  ]
}

export function demoLog(d: DeploymentView): LogLineView[] {
  const start = Date.parse(d.startedAt ?? d.createdAt)
  const lines = buildLog(d)
  return lines.map((line, seq) => ({
    seq,
    stream: seq < 4 || seq >= lines.length - 6 ? 'system' : 'stdout',
    line,
    ts: iso(start + seq * 1500),
  }))
}

// The live deploy: every so often one of the running apps gets a push and goes through
// waiting, building, deploying and live, with its log written as it goes.

type Listener = (deployment: DeploymentView) => void
const listeners = new Set<Listener>()
export const onDeployment = (listener: Listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const activeDeployments = () =>
  projects
    .flatMap((p) => p.deployments)
    .filter((d) => ['queued', 'building', 'deploying'].includes(d.status))

let simulating = false
let round = 0
const LIVE_MESSAGES = [
  'Fix a typo on the about page',
  'Post: notes from the weekend',
  'Speed up the image gallery',
]

function emit(d: DeploymentView) {
  for (const listener of listeners) listener({ ...d })
}

function runOnce() {
  const record = projects.filter((p) => p.view.desiredState === 'running')[round % 3]!
  const message = LIVE_MESSAGES[round % LIVE_MESSAGES.length]!
  round++
  const random = seeded(round * 31)
  const previous = record.deployments.at(-1)!
  const d: DeploymentView = {
    ...previous,
    id: uuid(5, round),
    number: previous.number + 1,
    commitSha: sha(random),
    commitMessage: message,
    status: 'queued',
    failureCode: null,
    failureReason: null,
    trigger: 'push',
    isCurrent: false,
    createdAt: iso(now()),
    startedAt: null,
    finishedAt: null,
  }
  record.deployments.push(d)
  emit(d)
  const step = (after: number, change: Partial<DeploymentView>, then?: () => void) =>
    setTimeout(() => {
      Object.assign(d, change)
      then?.()
      emit(d)
    }, after)
  step(2500, { status: 'building', startedAt: iso(now()) })
  step(16_000, { status: 'deploying' })
  step(22_000, { status: 'ready', finishedAt: iso(now()), isCurrent: true }, () => {
    for (const other of record.deployments)
      if (other !== d && other.isCurrent) {
        other.isCurrent = false
        emit(other)
      }
  })
}

/** Starts the live deploys once; the first begins a few seconds after the tour opens. */
export function startSimulation() {
  if (simulating) return
  simulating = true
  setTimeout(runOnce, 4000)
  setInterval(runOnce, 60_000)
}

/** How far the live deploy's log has got: the lines written so far. */
export function liveLogLines(d: DeploymentView): LogLineView[] {
  const all = demoLog({ ...d, status: 'ready', startedAt: d.startedAt ?? d.createdAt })
  if (d.status === 'ready') return all
  if (d.status === 'queued') return []
  const elapsed = now() - Date.parse(d.startedAt ?? d.createdAt)
  const shown = d.status === 'building' ? Math.min(11, Math.floor(elapsed / 1300)) : all.length - 2
  return all.slice(0, Math.max(1, shown))
}

// Readings for the flight deck and gauges: a laptop on a shelf, mostly idle.

const BASE_MEMORY = 5.1 * 1024 ** 3
export function demoSample(at = now()): MetricsSample {
  const t = at / 1000
  const wave = (period: number, amp: number) => Math.sin(t / period) * amp
  const busy = activeDeployments().some((d) => d.status === 'building') ? 38 : 0
  return {
    ts: iso(at),
    host: {
      cpuPercent: Math.max(2, 9 + wave(17, 5) + wave(5, 3) + busy),
      memoryUsedBytes: BASE_MEMORY + wave(60, 0.3 * 1024 ** 3) + busy * 20 * 1024 ** 2,
      memoryTotalBytes: 16 * 1024 ** 3,
      diskUsedBytes: 61 * 1024 ** 3,
      diskTotalBytes: 238 * 1024 ** 3,
      loadAverage: 0.4 + wave(40, 0.2) + busy / 30,
      uptimeSeconds: 19 * 86400 + (t % 86400),
      temperatures: [
        { name: 'CPU', celsius: 46 + wave(23, 3) + busy / 4 },
        { name: 'SSD', celsius: 38 + wave(90, 1) },
      ],
      battery: { percent: 100, status: 'Full' },
    },
    containers: projects
      .filter((p) => p.view.desiredState === 'running')
      .map((p, i) => ({
        projectId: p.view.id,
        cpuPercent: Math.max(0.1, 0.8 + i * 0.6 + wave(7 + i * 3, 0.6)),
        memoryUsedBytes: (60 + i * 45) * 1024 ** 2 + wave(30 + i, 6 * 1024 ** 2),
      })),
  }
}

/** Requests an app answers, for its Radio (runtime log). */
export function demoRuntimeLine(projectId: string, random = Math.random): string {
  const name = projects.find((p) => p.view.id === projectId)?.view.name ?? 'app'
  const paths =
    name === 'recipes-api'
      ? ['/recipes?page=2', '/recipes/314', '/search?q=pasta', '/health']
      : ['/', '/about', '/posts/a-year-with-a-home-server', '/rss.xml', '/assets/index.css']
  const path = paths[Math.floor(random() * paths.length)]!
  const ms = Math.floor(2 + random() * 40)
  return `${new Date().toISOString()} GET ${path} 200 ${ms}ms`
}

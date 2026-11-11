// Every piece of user-facing text in the Control Tower lives here, so the voice stays consistent
// and any wording (or the whole brand) can change in one place. Code never uses these words as
// identifiers: statuses are `queued`, `building`, … everywhere else.
//
// Voice rules: one pun at most per element, none in errors, warnings, destructive confirmations,
// or setup instructions. Buttons and form labels stay plain. Sentence case throughout.
import type { AddressStatus } from './enums.ts'
import type { FailureCode } from './failures.ts'
import type { DeploymentStatus } from './statuses.ts'

export const brand = {
  name: 'Hangar',
  tagline: 'Your own place to deploy apps',
  dashboardName: 'Control Tower',
  /** Shown in the browser tab after the page name, e.g. "Projects – Hangar". */
  titleSuffix: 'Hangar',
}

export interface StatusCopy {
  /** Themed label, shown on badges. */
  label: string
  /** What it actually means, shown as a tooltip or subtitle. */
  meaning: string
}

export const statusCopy: Record<DeploymentStatus, StatusCopy> = {
  queued: { label: 'Holding', meaning: 'Waiting for its turn to build' },
  building: { label: 'Preflight', meaning: 'Building your app' },
  deploying: { label: 'Taking off', meaning: 'Starting the new version and checking it responds' },
  ready: { label: 'Airborne', meaning: 'Built and serving traffic' },
  failed: { label: 'Grounded', meaning: 'The build or the health check failed' },
  cancelled: { label: 'Scrubbed', meaning: 'Stopped before it finished' },
}

export interface FailureCopy {
  /** What went wrong, in plain words. */
  explanation: string
  /** What to do about it. */
  fix: string
}

export const failureCopy: Record<FailureCode, FailureCopy> = {
  clone_failed: {
    explanation: 'Hangar could not download this commit from the repository.',
    fix: 'Check that the repository still exists. If it is private, connect a GitHub token in Account.',
  },
  build_failed: {
    explanation: 'The build stopped with an error.',
    fix: 'Read the last lines of the build log below; they usually name the problem.',
  },
  build_timeout: {
    explanation: 'The build took longer than 15 minutes and was stopped.',
    fix: 'Look for a step that hangs, such as one waiting for input, or make the build lighter.',
  },
  image_missing: {
    explanation: 'The image for this version was cleaned up, so it cannot be started again.',
    fix: 'Deploy the commit again to rebuild it. Hangar keeps the five most recent successful images.',
  },
  container_start_failed: {
    explanation: 'Docker could not start the app.',
    fix: 'Check the memory limit in Settings and the build log for details.',
  },
  health_check_failed: {
    explanation:
      'The app started but did not answer on its port, so the previous version kept serving.',
    fix: 'Make sure the app listens on 0.0.0.0 and on the port in the PORT variable (or set the port in Settings).',
  },
  interrupted: {
    explanation: 'Hangar restarted while this deployment was running.',
    fix: 'Deploy again. Nothing else is needed.',
  },
  superseded: {
    explanation: 'A newer deployment of this project took its place.',
    fix: 'No action needed.',
  },
  cancelled_by_user: {
    explanation: 'Someone cancelled this deployment.',
    fix: 'Deploy again when you are ready.',
  },
  internal: {
    explanation: 'Something unexpected went wrong inside Hangar.',
    fix: 'Try again. If it keeps happening, check the hangar-core container logs.',
  },
}

export const triggerCopy = {
  push: 'GitHub push',
  poll: 'New commit found',
  manual: 'Deployed by hand',
  rollback: 'Rollback',
} as const

export const triggerModeCopy = {
  poll: {
    label: 'Check for new commits',
    meaning: 'Hangar looks at the branch every minute and deploys new commits.',
  },
  webhook: {
    label: 'GitHub webhook',
    meaning: 'GitHub tells Hangar about each push. Needs public access to be set up.',
  },
  manual: { label: 'Only by hand', meaning: 'Nothing deploys until you press Deploy.' },
} as const

export const navCopy = {
  overview: 'Overview',
  publish: 'Publish',
  servers: 'Servers',
  projects: 'Projects',
  projectCount: (n: number) => `${n} ${n === 1 ? 'app' : 'apps'} in the hangar`,
  settings: 'Settings',
  users: 'People',
  account: 'Account',
  guide: 'Guide',
  signOut: 'Sign out',
  newProject: 'New project',
  thisServer: 'This server',
  switchServer: 'Switch server',
  addServer: 'Add a server',
  offline: 'Offline',
  online: 'Online',
  notPaired: 'Waiting to connect',
  noServer: 'No server yet',
} as const

export const instrumentsCopy = {
  title: 'Instruments',
  cpu: 'CPU',
  memory: 'Memory',
  disk: 'Disk',
  temperature: 'CPU temperature',
  noSensors: 'This machine reports no temperature sensors.',
  battery: 'Battery',
  uptime: 'Up for',
  load: (value: number) => `Load ${value.toFixed(2)}`,
  threads: (n: number) => `${n} threads`,
  images: (size: string) => `${size} of app images`,
  version: 'Version',
  waiting: 'Reading the instruments…',
  /** Battery states as the kernel names them. */
  batteryStatus: {
    Charging: 'Charging',
    Discharging: 'On battery',
    'Not charging': 'Plugged in, not charging',
    Full: 'Full, plugged in',
  } as Record<string, string>,
} as const

/** The home screen's widgets and its Customize mode. */
export const dashboardCopy = {
  customize: 'Customize',
  done: 'Done',
  undo: 'Undo',
  redo: 'Redo',
  reset: 'Reset layout',
  resetConfirm: {
    title: 'Reset the home screen?',
    body: 'Every widget goes back to where a new install puts it. Your apps are not affected.',
    action: 'Reset layout',
  },
  categories: { traffic: 'Traffic', instruments: 'Instruments', machine: 'Machine' },
  widgets: {
    departures: {
      title: 'Departures',
      description: 'Deployments under way, stage by stage.',
    },
    projects: {
      title: 'Projects',
      description: 'Every app with its address, last commit, and status.',
    },
    activity: { title: 'Latest activity', description: 'The newest deployment of each project.' },
    outcomes: {
      title: 'Deployment results',
      description: 'How recent deployments ended, per project.',
    },
    cpu: { title: 'CPU', description: 'Processor use and load, with its trend.' },
    memory: { title: 'Memory', description: 'Memory in use, with its trend.' },
    disk: { title: 'Disk', description: 'Disk space in use.' },
    temperature: { title: 'CPU temperature', description: 'How hot the processor runs.' },
    battery: { title: 'Battery', description: 'Charge left, for laptops.' },
    uptime: { title: 'Up for', description: 'Time since the server last started.' },
    machine: { title: 'Machine', description: 'Processor, kernel, and Hangar version.' },
  },
} as const

export const projectTabsCopy = {
  deployments: 'Deployments',
  radio: 'Radio',
  radioMeaning: 'Live output from the running app',
  environment: 'Environment',
  settings: 'Settings',
} as const

export const flightRecorderCopy = {
  title: 'Flight Recorder',
  meaning: 'The build log',
  waiting: 'Waiting for the first lines…',
  jumpToLatest: 'Jump to latest',
  copy: 'Copy log',
  copied: 'Log copied',
  download: 'Download',
  tailNumber: 'Tail number',
  tailNumberMeaning: 'The short commit ID',
} as const

export const emptyCopy = {
  projects: {
    title: "Your hangar is empty. Let's roll something in.",
    body: 'Connect a repository and Hangar builds and runs it, then redeploys on every new commit.',
    action: 'New project',
  },
  deployments: { title: 'No deployments yet', body: 'Press Deploy to build the latest commit.' },
  env: {
    title: 'No environment variables',
    body: 'Add settings your app reads at runtime, like API keys. Values are encrypted and also available during builds.',
  },
  radio: {
    notRunning: 'The app is not running, so there is no live output.',
    quiet: 'Connected. The app has not printed anything yet.',
    connecting: 'Tuning in…',
    reconnecting: 'Connection lost. Reconnecting…',
    ended: 'The app stopped. Reconnect after it starts again.',
  },
} as const

export const loadingLines = [
  'Taxiing to the runway…',
  'Checking the instruments…',
  'Waiting for clearance…',
  'Reading the flight plan…',
] as const

export const toastCopy = {
  deployQueued: 'Deployment queued',
  firstLive: 'Wheels up! Your app is airborne.',
  live: (name: string) => `${name} is live`,
  failed: (name: string) => `${name} did not deploy`,
  saved: 'Saved',
  rollbackQueued: 'Rollback queued',
  cancelRequested: 'Cancel requested',
  projectDeleted: 'Project deleted',
  started: 'App started',
  stopped: 'App stopped',
  restarted: 'App restarted',
  copied: 'Copied',
} as const

export const confirmCopy = {
  deleteProject: {
    title: 'Delete this project?',
    body: 'This stops the app and deletes its containers, images, deployments, logs, and environment variables. It cannot be undone.',
    typeToConfirm: (name: string) => `Type ${name} to confirm`,
    action: 'Delete project',
  },
  rollback: {
    title: 'Roll back to this version?',
    body: 'Hangar starts this version again from its saved image, checks it responds, then switches traffic to it.',
    action: 'Roll back',
  },
  stop: {
    title: 'Stop this app?',
    body: 'Visitors will see a "not running" page until you start it again.',
    action: 'Stop app',
  },
} as const

/** What the last real request to a public address found. Plain words: this is a diagnosis. */
export const addressCopy: Record<AddressStatus | 'checking', StatusCopy> = {
  checking: { label: 'Checking', meaning: 'Hangar is checking this address now' },
  live: { label: 'Live', meaning: 'The app answered over the internet' },
  app_down: { label: 'App not answering', meaning: 'The address works, but the app did not reply' },
  not_running: { label: 'Not running', meaning: 'There is no running app behind this address' },
  elsewhere: { label: 'Points elsewhere', meaning: 'Another server answered at this address' },
  unreachable: { label: 'Not reachable', meaning: 'This address did not reach Hangar' },
  no_tunnel: { label: 'No tunnel', meaning: 'Hangar has no tunnel to the internet yet' },
}

export const accountCopy = {
  title: 'Account',
  passwordTitle: 'Password',
  passwordBody: 'Changing it signs you out everywhere else.',
  currentPassword: 'Current password',
  newPassword: 'New password',
  changePassword: 'Change password',
  githubDescription:
    'Your own GitHub connection, used only for your projects. Needed for private repositories and for picking repositories from a list.',
  githubAppDescription:
    'Connect once, then sign in with GitHub and pick repositories from a list. Hangar sees only the repositories you choose, and can read them but not change them.',
  connectGithub: 'Connect with GitHub',
  reconnectGithub: 'Connect again',
  connectedAs: (login: string) => `Connected as ${login}. You can sign in with GitHub.`,
  connectedToken: 'Connected with a token.',
  chooseRepos: 'Choose repositories',
  chooseReposHelp:
    'Pick which of your repositories, or your organizations’, Hangar can see. Include the repositories of projects you already have.',
  useToken: 'Use a token instead',
  installedToast: 'GitHub is updated. Your repositories are ready to pick.',
  linkedToast: 'GitHub is connected.',
  firstPasswordTitle: 'Password',
  firstPasswordBody:
    'You sign in with GitHub. Add a password to also sign in without it. This signs you out everywhere else.',
  setPassword: 'Set password',
  sessionsTitle: 'Sessions',
  sessionsBody:
    'Lost a device or signed in somewhere shared? This ends every session, this one too.',
  signOutEverywhere: 'Sign out everywhere',
  signOutConfirm: {
    title: 'Sign out everywhere?',
    body: 'Every browser signed in to this account, including this one, will need to sign in again.',
    action: 'Sign out everywhere',
  },
} as const

/** Settings: the GitHub App behind "Sign in with GitHub". */
export const githubAppCopy = {
  title: 'Sign in with GitHub',
  description:
    'Lets people sign in with their GitHub account and pick repositories without making tokens. Only people with an account or an invite can get in.',
  setUp: 'Set up on GitHub',
  setUpHelp:
    'GitHub asks you to confirm a new app for your account. It can only read the repositories each person chooses, and add webhooks to them.',
  connected: (slug: string, owner: string) => `Using the GitHub App ${slug}, owned by ${owner}.`,
  manage: 'Manage on GitHub',
  remove: 'Turn off',
  removeConfirm: {
    title: 'Turn off Sign in with GitHub?',
    body: 'People who joined with GitHub need a password, or a reset link from you, to sign in. The app stays on GitHub until you delete it there.',
    action: 'Turn off',
  },
  newAddressHint:
    'Added a new address for the Control Tower later? Add it, ending in /auth/github, as a callback URL in the app on GitHub.',
  created: 'Sign in with GitHub is ready.',
  finishing: 'Finishing the setup with GitHub…',
  openTitle: 'Let anyone sign up with GitHub',
  openBody:
    'New accounts can only use servers of their own, never this one. Turn it off to go back to invites only.',
} as const

export const usersCopy = {
  title: 'People',
  subtitle:
    'Everyone here signs in with their own account and sees only their own projects. Each account can run code on this server, so invite only people you trust.',
  accounts: 'Accounts',
  invites: 'Invites',
  inviteDescription: 'There is no public sign-up. An invite link works once, for 7 days.',
  inviteLabel: 'Who is it for? (optional)',
  invite: 'Create invite link',
  inviteReady: 'Send this link to them. It is shown only once.',
  resetReady: (name: string) =>
    `Send this link to ${name}. It works once, for 7 days, and is shown only once.`,
  linkHint: 'They need to be able to reach this address.',
  roles: { admin: 'Admin', member: 'Member' },
  roleHelp:
    'Admins also manage accounts and server settings. Nobody sees anyone else’s projects, admins included.',
  resetPassword: 'Reset link',
  noInvites: 'No open invites.',
  projects: (n: number) => `${n} ${n === 1 ? 'project' : 'projects'}`,
  deleteConfirm: (name: string, projects: number) => ({
    title: `Delete ${name}?`,
    body:
      projects > 0
        ? `This deletes the account and its ${projects === 1 ? 'project' : `${projects} projects`}, with their apps, images, logs, and environment variables. It cannot be undone.`
        : 'This deletes the account. It cannot be undone.',
    action: 'Delete account',
  }),
} as const

/** The page behind an invite or password reset link. */
export const linkCopy = {
  inviteTitle: 'Create your account',
  inviteBody: 'Choose a username and a password for this Hangar.',
  resetTitle: (name: string) => `Set a new password for ${name}`,
  resetBody: 'This signs the account out everywhere.',
  invalidTitle: 'This link does not work',
  invalidBody: 'It has expired or was already used. Ask your admin for a new one.',
  create: 'Create account',
  save: 'Set password',
  toSignIn: 'Go to sign in',
  withGithub: 'Continue with GitHub',
  githubBody: 'Your account is made from your GitHub account, and GitHub is connected for deploys.',
  usernameOptional: 'Username (optional with GitHub)',
  orPassword: 'or choose a password',
} as const

export const authCopy = {
  signInTitle: 'Sign in to the Control Tower',
  username: 'Username',
  password: 'Password',
  signIn: 'Sign in',
  sessionExpired: 'Your session ended. Sign in again.',
  withGithub: 'Sign in with GitHub',
  or: 'or',
  githubWorking: 'Talking to GitHub…',
  githubCancelled: 'GitHub sign-in was cancelled.',
  backToSignIn: 'Back to sign in',
  backToAccount: 'Back to Account',
  unreachableTitle: 'Hangar is not responding',
} as const

/** The Preflight Checklist: first-run setup. Plain words only in instructions. */
export const setupCopy = {
  title: 'Preflight Checklist',
  intro: 'Four short steps to get Hangar ready. You can change everything later in Settings.',
  steps: {
    account: {
      title: 'Create your account',
      body: 'Enter the boarding pass the installer printed. It is a one-time code that proves you own this server.',
      codeLabel: 'Boarding pass',
      codeHelp: 'Lost it? On the server, run: sudo hangar-admin issue-setup-code',
      usernameHelp: '3 to 32 characters: lowercase letters, digits, dots, dashes, underscores',
      passwordHelp: 'At least 10 characters',
      action: 'Create account',
    },
    address: {
      title: 'Confirm the address',
      body: 'Apps get their own address on this network. Hangar uses a free service, sslip.io, that turns any name ending in your server address into that address, so nothing needs configuring.',
      ipLabel: 'Server address',
      ipHelp: 'The address other devices use to reach this server.',
      preview: 'Your apps will be at',
      exampleApp: 'An app called blog',
      publicNote:
        'This address works on your network only. To reach apps from anywhere on your own domain, set up public access later in Settings.',
      action: 'Continue',
    },
    github: {
      title: 'Connect GitHub (optional)',
      body: 'Public repositories work without this. For private ones, create a fine-grained token with read access to Contents and Metadata.',
      tokenLabel: 'GitHub token',
      connectedAs: (login: string) => `Connected to GitHub as ${login}.`,
      createLink: 'Create a token on GitHub',
      action: 'Connect',
      skip: 'Skip for now',
    },
    testFlight: {
      title: 'Take a test flight',
      body: 'Deploy a small sample site to see the whole process: build, health check, and going live.',
      action: 'Deploy the sample',
      watchLog: 'Watch the build log',
      openIt: 'Open it:',
      skip: 'Skip',
      done: 'Go to the Control Tower',
    },
  },
} as const

/** The guide page and the first-visit tour. */
export const guideCopy = {
  title: 'How Hangar works',
  intro:
    'A short tour of what happens when you deploy, and where to look when something goes wrong.',
  pipelineTitle: 'What happens when you deploy',
  pipeline: [
    { title: 'Download', body: 'Fetch exactly the commit being deployed.' },
    {
      title: 'Build',
      body: 'Turn the code into an image, using your Dockerfile or by detecting the framework.',
    },
    { title: 'Start', body: 'Run the new version next to the old one. Nobody sees it yet.' },
    { title: 'Check', body: 'Wait up to a minute for the app to answer on its port.' },
    { title: 'Switch', body: 'Point the address at the new version, then stop the old one.' },
  ],
  pipelineNote:
    'If any step fails, the previous version keeps serving and nothing changes for visitors.',
  sections: [
    {
      title: 'Projects',
      body: 'A project is one app from one repository branch. Its name becomes its address: a project called blog is served at blog.<your address>.',
    },
    {
      title: 'Deployments',
      body: "Each deployment builds and runs one commit. A project's page lists them, newest first, with the build log of each.",
    },
    {
      title: 'Logs',
      body: 'The Flight Recorder shows the build log of a deployment. Radio shows what the running app prints, live.',
    },
    {
      title: 'Rollback',
      body: 'Every successful deployment keeps its image. Roll back to restart an earlier version in seconds without rebuilding.',
    },
    {
      title: 'Environment variables',
      body: 'Settings your app reads, like API keys. They are encrypted on disk, available to the build as secrets, and applied on the next deploy.',
    },
    {
      title: 'Automatic deploys',
      body: 'By default Hangar checks your branch every minute and deploys new commits. With public access set up, GitHub can notify Hangar instantly instead.',
    },
  ],
  tour: [
    {
      target: 'server',
      title: 'Your servers',
      body: 'Everything on this page comes from the server chosen here. Switch to another one, or add a server, from this menu.',
    },
    {
      target: 'deck',
      title: 'The flight deck',
      body: 'Live readings from that server, and how its deploys went over the last two weeks.',
    },
    {
      target: 'departures',
      title: 'Departures',
      body: 'Deployments under way move along this route, from waiting to building to live.',
    },
    {
      target: 'projects',
      title: 'Your apps',
      body: 'One row per app: its address, the commit it runs, and its status. The lights are its latest deployments, newest on the right.',
    },
    {
      target: 'new-project',
      title: 'Publish a repository',
      body: 'Pick any of your GitHub repositories and Hangar builds it on this server and gives it an address.',
    },
    {
      target: 'customize',
      title: 'Make it yours',
      body: 'Move, resize, and remove the boxes below the deck, or add others like temperature and battery. Your layout is saved to your account.',
    },
    { target: 'guide', title: 'Guide', body: 'How deploys work, and what each status means.' },
  ],
  tourNext: 'Next',
  tourDone: 'Done',
  tourSkip: 'Skip tour',
} as const

export const notFoundCopy = {
  title: 'This flight has already left the gate.',
  body: 'The page you asked for does not exist.',
  action: 'Back to projects',
} as const

export const errorCopy = {
  port: 'Enter a port from 1 to 65535, or leave it empty.',
  memory: 'Enter a whole number of megabytes from 64 to 65536.',
  network: 'Hangar did not respond. Check that the server is running and reachable.',
  unexpected: 'Something went wrong. Try again.',
} as const

/** The front door: what a visitor sees before signing in. */
export const landingCopy = {
  title: 'Deploy from GitHub to a computer you own',
  lede: 'Hangar turns a spare laptop or mini PC into your own deploy platform. Sign in with GitHub, run one command on your machine, and publish any repository to your own domain. Your code builds and runs at home, not on someone else’s cloud.',
  signInGithub: 'Sign in with GitHub',
  signIn: 'Sign in with a password',
  inviteOnly: 'Accounts here are by invitation.',
  flightPlan: 'flight-plan',
  plan: [
    { label: 'Repository', value: 'you/portfolio' },
    { label: 'Server', value: 'home-laptop' },
    { label: 'Build', value: 'Vite detected, built in 41 s' },
    { label: 'Address', value: 'portfolio.yourdomain.com' },
  ],
  planStatus: 'Live',
  stepsTitle: 'From sign-in to a live app',
  steps: [
    {
      title: 'Sign in with GitHub',
      body: 'Hangar sees only the repositories you choose, and can read them but not change them.',
    },
    {
      title: 'Connect your server',
      body: 'Copy one command and run it on your machine. It installs Hangar there and connects back here. No ports to open.',
    },
    {
      title: 'Put it on the internet',
      body: 'Paste a free Cloudflare Tunnel token and add your domain. Your home address stays private.',
    },
    {
      title: 'Publish a repository',
      body: 'Pick a repo and press Publish. Every push after that deploys by itself, with rollback one click away.',
    },
  ],
  whereTitle: 'What runs where',
  where: [
    {
      name: 'This site',
      body: 'Your sign-in, your list of servers, and the dashboard. It passes your requests to your server.',
    },
    {
      name: 'Your server',
      body: 'Builds, apps, logs, environment variables, and the tunnel. It connects out to this site and to Cloudflare.',
    },
    {
      name: 'Cloudflare',
      body: 'Carries visitors to your apps through the tunnel, with HTTPS. Free.',
    },
  ],
  needsTitle: 'What your server needs',
  needs: [
    'Ubuntu 22.04 or 24.04, or Debian 12',
    '2 GB of memory and 10 GB of free disk',
    'An internet connection. Docker is installed for you.',
  ],
  source: 'Hangar is open source',
} as const

/** This machine is someone's own server; its dashboard lives elsewhere. */
export const managedCopy = {
  title: 'This server is run from another Hangar',
  body: (url: string) =>
    `Open ${url} and sign in there. Your apps build and run on this machine; that site sends it your requests.`,
  open: 'Open the dashboard',
} as const

/** First steps after signing in. */
export const startCopy = {
  title: 'Get set up',
  subtitle: 'Five steps to your first app on your own server. Each one checks itself off.',
  done: 'Done',
  next: 'Up next',
  optional: 'Optional',
  steps: {
    github: {
      title: 'Connect GitHub',
      body: 'Hangar uses your GitHub connection to list repositories and to download the ones you publish.',
      action: 'Connect with GitHub',
      tokenInstead: 'GitHub sign-in is not set up here. Add a token under Account instead.',
      toAccount: 'Open Account',
    },
    server: {
      title: 'Connect your server',
      body: 'A computer that stays on: an old laptop, a mini PC, or a home server. Hangar installs itself there and connects back here.',
      nameLabel: 'What do you call it?',
      namePlaceholder: 'Home laptop',
      create: 'Get the install command',
      run: 'On that machine, open a terminal and run:',
      waiting: 'Waiting for your server to connect…',
      waitingHelp:
        'Installing takes two to five minutes the first time. Leave this page open; it updates by itself.',
      connected: (name: string) => `${name} is connected.`,
      expires: 'The command works once, for an hour.',
      trouble: 'Not showing up?',
      troubleSteps: [
        'Run it on the server itself, as written: it needs sudo.',
        'Check the machine can reach the internet: curl -I https://github.com',
        'See what Hangar is doing there: sudo docker logs hangar-core',
      ],
    },
    repos: {
      title: 'Choose repositories',
      body: 'Pick which of your repositories Hangar may see. You can change this at any time on GitHub.',
      action: 'Choose on GitHub',
      check: 'Check again',
      found: (n: number) => `${n} ${n === 1 ? 'repository' : 'repositories'} ready to publish.`,
    },
    internet: {
      title: 'Put apps on the internet',
      body: 'Apps already work on your home network. To reach them from anywhere, connect a free Cloudflare Tunnel and add a domain on your Cloudflare account.',
      action: 'Open Public access',
      skip: 'Apps still answer on your network without it.',
    },
    publish: {
      title: 'Publish your first app',
      body: 'Choose a repository and press Publish. Hangar detects the framework, builds it on your server, and gives it an address.',
      action: 'Choose a repository',
    },
  },
} as const

export const serversCopy = {
  title: 'Servers',
  subtitle:
    'The machines your apps run on. Each one connects out to this site, so it needs no open ports.',
  here: 'This server',
  hereBody: 'The machine this site runs on.',
  add: 'Add a server',
  addBody: 'Give it a name, then run the command it gives you on that machine.',
  open: 'Show its apps',
  showing: 'Showing',
  rename: 'Rename',
  newCommand: 'New install command',
  newCommandBody:
    'For a command that ran out, or to move this server to another machine. The old connection stops working.',
  remove: 'Remove',
  removeConfirm: (name: string) => ({
    title: `Remove ${name}?`,
    body: 'It stops connecting here. Its apps keep running on that machine until you remove them there with sudo hangar-uninstall.',
    action: 'Remove server',
  }),
  lastSeen: 'Last seen',
  never: 'Not connected yet',
  empty: 'No servers yet. Add one to start publishing apps.',
  fields: {
    machine: 'Machine',
    system: 'System',
    cpu: 'Processor',
    memory: 'Memory',
    address: 'Network address',
    version: 'Hangar',
  },
} as const

export const publishCopy = {
  title: 'Publish',
  subtitle: (server: string) => `Pick a repository to build and run on ${server}.`,
  search: 'Find a repository',
  publish: 'Publish',
  publishing: 'Publishing…',
  open: 'Open',
  private: 'Private',
  updated: (when: string) => `Pushed ${when}`,
  empty: 'No repositories yet. Choose which ones Hangar may see on GitHub.',
  noMatch: 'No repository matches that.',
  chooseRepos: 'Choose repositories on GitHub',
  notConnected: 'Connect GitHub first to see your repositories.',
  connect: 'Connect GitHub',
  advanced: 'More options',
  published: (name: string) => `Publishing ${name}. Watch it build.`,
} as const

export const settingsCopy = {
  title: 'Settings',
  subtitle: (server: string) =>
    `For ${server}: its address, public access, and the machine itself.`,
  sections: {
    network: { label: 'Network', description: 'How devices at home reach this server.' },
    public: { label: 'Public access', description: 'Your domains, through a Cloudflare Tunnel.' },
    system: { label: 'System', description: 'The machine and the Hangar running on it.' },
  },
} as const

/** The home screen's top: the chosen server's live readings and the week's numbers. */
export const deckCopy = {
  readings: { cpu: 'CPU', memory: 'Memory', disk: 'Disk', uptime: 'Up for' },
  waiting: 'Reading…',
  stats: {
    live: 'Apps live',
    deploys: 'Deploys, 7 days',
    success: 'Success rate',
    median: 'Typical deploy',
    noData: 'No deploys yet',
  },
  history: 'Deploys per day, last 14 days',
  offline: 'This server is offline. What you see may be out of date.',
} as const

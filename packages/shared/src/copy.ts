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
  pull_failed: {
    explanation: 'Hangar could not download the image.',
    fix: 'Check the image name and version on its registry page, and that this computer is online.',
  },
  not_permitted: {
    explanation:
      'This app uses something only an admin can grant (a library, the graphics chip, or a published image), and its owner is no longer an admin.',
    fix: 'Ask an admin to update the app, or remove those settings.',
  },
  build_failed: {
    explanation: 'The build stopped with an error.',
    fix: 'Read the last lines of the build log below; they usually name the problem.',
  },
  build_timeout: {
    explanation: "The build took longer than the app's build time limit and was stopped.",
    fix: 'Look for a step that hangs, such as one waiting for input. If the build is simply big, raise the build time limit in Settings.',
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
  apps: 'Apps',
  projects: 'Projects',
  projectCount: (n: number) => `${n} ${n === 1 ? 'app' : 'apps'} in the hangar`,
  settings: 'Settings',
  users: 'People',
  account: 'Account',
  guide: 'Guide',
  signOut: 'Sign out',
  newProject: 'New project',
  thisServer: 'This server',
  getStarted: 'Get started',
  switchServer: 'Switch server',
  offline: 'Offline',
  online: 'Online',
  notPaired: 'Waiting to connect',
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
  launcher: {
    empty: 'Apps you install show up here, one tile each.',
    browse: 'Browse apps',
    lights: {
      live: 'Live: opens in a new tab',
      busy: 'Deploying now',
      failed: 'The last deploy failed: opens its page',
      stopped: 'Stopped: opens its page',
      none: 'Not live yet: opens its page',
    },
  },
  widgets: {
    departures: {
      title: 'Departures',
      description: 'Deployments under way, stage by stage.',
    },
    projects: {
      title: 'Projects',
      description: 'Every app with its address, last commit, and status.',
    },
    launcher: {
      title: 'Launcher',
      description: 'Open any of your apps in one click, like a folder of bookmarks.',
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
    partNotRunning:
      'This part is not running, so there is no live output. Deploying the app starts it again.',
    /** Apps made of several parts (D44): whose output to show, and how each part is doing. */
    parts: 'Parts of this app',
    app: 'The app',
    partStates: {
      running: 'Running',
      starting: 'Starting',
      unhealthy: 'Running, but its health check fails',
      stopped: 'Stopped',
      missing: 'Not created yet: deploy the app',
    },
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
  deleteTitle: 'Delete account',
  deleteBody:
    'Deletes your account and everything this site keeps about you. Your servers are disconnected and forget this site; the apps on them keep running until you remove Hangar there with sudo hangar-uninstall.',
  deleteLabel: (username: string) => `Type ${username} to confirm`,
  deleteMismatch: 'Type your username exactly as shown to confirm.',
  deleteAction: 'Delete my account',
  deleteConfirm: {
    title: 'Delete your account?',
    body: 'This cannot be undone. You will be signed out, and your servers will stop taking requests from this site.',
    action: 'Delete my account',
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
      target: 'deck',
      title: 'The flight deck',
      body: 'Live readings from this computer, and how its deploys went over the last two weeks.',
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

/** The public site's front page (hangar.benduffaut.com). */
export const landingCopy = {
  title: 'Deploy from GitHub to a computer you own',
  lede: 'Hangar turns a spare laptop, mini PC, or Raspberry Pi into your own deploy platform, like Vercel at home. Push to GitHub and your app builds and goes live on your own domain. The dashboard stays private to your own devices.',
  install: 'Install Hangar',
  tour: 'Take the tour',
  tourNote: 'Free and open source. The tour runs in your browser: nothing to install.',
  commandLabel: 'Run this on the computer that will host your apps (Ubuntu or Debian):',
  commandNote: 'It downloads the latest release from GitHub and checks it before anything runs.',
  commandGuide: 'Read the install guide',
  free: 'Free and open source. Your computer, your apps, your data.',
  flightPlan: 'flight-plan',
  plan: [
    { label: 'Repository', value: 'you/portfolio' },
    { label: 'Server', value: 'home-laptop' },
    { label: 'Build', value: 'Vite detected, built in 41 s' },
    { label: 'Address', value: 'portfolio.yourdomain.com' },
  ],
  planStatus: 'Live',
  stepsTitle: 'From a spare computer to a live app',
  steps: [
    {
      title: 'Get Tailscale',
      body: 'Install the free Tailscale app on your phone or laptop. It is how you, and only you, reach your dashboard from anywhere.',
    },
    {
      title: 'Run one command',
      body: 'On a spare computer, paste the install command. It sets up Docker, Hangar, and Tailscale, and prints your private address.',
    },
    {
      title: 'Open your dashboard',
      body: 'On any of your devices, open that address. Create your account, then connect GitHub.',
    },
    {
      title: 'Publish a repository',
      body: 'Pick a repo and press Publish. Add a free Cloudflare Tunnel to put it on your domain. Every push deploys by itself.',
    },
  ],
  whereTitle: 'What runs where',
  where: [
    {
      name: 'Your computer',
      body: 'Everything: the dashboard, builds, your apps, logs, and settings. Nothing about your apps is stored anywhere else.',
    },
    {
      name: 'Tailscale',
      body: 'A private network between your own devices. The dashboard answers only there, so nobody else can even see its sign-in page.',
    },
    {
      name: 'Cloudflare (optional)',
      body: 'Carries visitors to the apps you choose to publish, with HTTPS. Your home address stays hidden and no router ports are opened.',
    },
  ],
  needsTitle: 'What your computer needs',
  needs: [
    'Ubuntu 22.04, 24.04 or 26.04, or Debian 12 or 13, on 64-bit Intel/AMD or ARM',
    '2 GB of memory and 10 GB of free disk',
    'An internet connection. Docker and Tailscale are installed for you.',
  ],
  source: 'Source on GitHub',
  docs: 'Guides',
  privacy: 'Privacy',
  faqTitle: 'Questions',
  faqMore: 'Something else? The guides cover every step, from installing to sharing with family.',
  faqGuides: 'Open the guides',
  faq: [
    {
      q: 'What does it cost?',
      a: 'Nothing. Hangar is free and open source under the MIT license. Tailscale is free for personal use, and so is a Cloudflare Tunnel. You only need a computer that stays on.',
    },
    {
      q: 'Is my dashboard on the internet?',
      a: 'No. It answers only on your Tailscale network, so it is reachable from your own devices and nobody else’s. Only the apps you choose to publish are public.',
    },
    {
      q: 'Do I need an account on this site?',
      a: 'No. This site is just the guide and the installer. There are no accounts here, and it never connects to your computer. Your Hangar is entirely yours.',
    },
    {
      q: 'Do I need to open ports on my router?',
      a: 'No. Tailscale and Cloudflare both connect out from your computer, so nothing on your home network is opened.',
    },
    {
      q: 'What can I deploy?',
      a: 'Any repository with a Dockerfile, or a common framework Hangar can detect: Node.js, Vite, Next.js, Astro, Python, Go, static sites, and more. One computer can run many apps.',
    },
    {
      q: 'Can my family or team use it?',
      a: 'Yes. Invite people from the dashboard. Each person sees only their own apps, and reaches the dashboard through your Tailscale network once you share it with them.',
    },
    {
      q: 'What if my computer is off?',
      a: 'Your apps go offline until it is back: they run on it. Hangar starts them again by itself after a restart. A mini PC or an old laptop on a shelf is ideal.',
    },
  ],
} as const

/** The tour on the public site: the real dashboard with a sample hangar, in the browser only. */
export const demoCopy = {
  start: 'Take the tour',
  startHint: 'No install needed',
  banner:
    'This is a sample hangar running in your browser. Nothing here is real, and nothing is saved.',
  bannerShort: 'Sample hangar',
  bannerAction: 'Install Hangar',
  bannerLeave: 'Leave the tour',
  promptTitle: 'Ready to fly your own?',
  promptAction: (what: string) =>
    `To ${what}, install Hangar on a computer of your own. It is free, and takes about 10 minutes.`,
  promptTourDone:
    'That is the whole tour. Install Hangar on a spare computer and this dashboard is yours: private to your devices, with your apps on your own domain.',
  promptSteps: [
    'Install Tailscale on your phone or laptop, so you can reach your dashboard from anywhere.',
    'Run one command on a spare computer with Ubuntu or Debian.',
    'Open your private dashboard and publish a repository.',
  ],
  promptInstall: 'Read the install guide',
  promptHow: 'How it works',
  promptKeepLooking: 'Keep exploring',
  /** What a visitor tried to do, by endpoint; anything else is "do that". */
  actions: {
    createProject: 'publish an app',
    deployProject: 'deploy',
    rollbackDeployment: 'roll back',
    cancelDeployment: 'cancel a deploy',
    startProject: 'start an app',
    stopProject: 'stop an app',
    restartProject: 'restart an app',
    deleteProject: 'delete an app',
    updateProject: 'change an app',
    replaceEnv: 'save environment variables',
    updateSettings: 'change settings',
    setTunnelToken: 'put your apps on the internet',
    setGithubToken: 'connect GitHub',
    githubStart: 'connect GitHub',
    githubAppManifest: 'set up sign in with GitHub',
    createInvite: 'invite someone',
    changePassword: 'change your password',
    setFirstPassword: 'set a password',
    signOutEverywhere: 'manage your sessions',
    deleteAccount: 'delete an account',
  } as Record<string, string>,
  fallbackAction: 'do that',
} as const

/** The Control Tower's private address on the owner's Tailscale network (D40). */
export const privateCopy = {
  title: 'Your private address',
  description:
    'Open the Control Tower from any of your devices with Tailscale: your phone, laptop, or tablet. Nobody else can reach it.',
  label: 'private address',
  devices:
    'On another device: install Tailscale, sign in with the same account, then open this address. Bookmark it, or add it to your home screen.',
  missing:
    'Hangar was installed without Tailscale, so the Control Tower answers only on your local network. To reach it from anywhere, run sudo hangar-tailscale on the server.',
} as const

/** First steps after signing in. */
export const startCopy = {
  title: 'Get set up',
  subtitle: 'Five steps to your first app on this server. Each one checks itself off.',
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
    devices: {
      title: 'Open Hangar on your other devices',
      body: 'This dashboard is private: it answers only on your own Tailscale network, from anywhere. Nobody else can reach it, not even the sign-in page.',
      label: 'private address',
      how: [
        'Install Tailscale on your phone or laptop (tailscale.com/download).',
        'Sign in with the same Tailscale account you used for this server.',
        'Open the address above. Bookmark it, or add it to your home screen.',
      ],
      noTailscale:
        'Hangar was installed without Tailscale, so this dashboard answers only on your local network. Run sudo hangar-tailscale on the server to reach it from anywhere.',
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
    storage: { label: 'Storage', description: 'Folders apps may use, and the data they keep.' },
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

/** The public site's privacy page. Plain words, no puns. */
export const legalCopy = {
  updated: 'Last updated November 17, 2026',
  back: 'Back to Hangar',
  privacy: {
    title: 'Privacy',
    sections: [
      {
        heading: 'This site',
        body: 'hangar.benduffaut.com is a static website: the guides and the tour. It is hosted with Hangar itself. It has no accounts, no cookies, no analytics, and no database. The tour runs entirely in your browser with sample data.',
      },
      {
        heading: 'Your Hangar',
        body: 'Hangar runs on your own computer. Your account, code, builds, apps, logs, and settings stay there. Nothing is sent to this site or to its author, ever.',
      },
      {
        heading: 'Other services',
        body: 'Cloudflare carries traffic to this site and keeps its own logs. The install command and the installer download Hangar from GitHub, Docker from Docker, and Tailscale from Tailscale. GitHub, Tailscale, and Cloudflare handle what you connect to them under their own privacy policies.',
      },
      {
        heading: 'Questions',
        body: 'Open an issue at github.com/bduffaut/Hangar.',
      },
    ],
  },
} as const

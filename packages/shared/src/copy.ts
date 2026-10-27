// Every piece of user-facing text in the Control Tower lives here, so the voice stays consistent
// and any wording (or the whole brand) can change in one place. Code never uses these words as
// identifiers: statuses are `queued`, `building`, … everywhere else.
//
// Voice rules: one pun at most per element, none in errors, warnings, destructive confirmations,
// or setup instructions. Buttons and form labels stay plain. Sentence case throughout.
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
    fix: 'Check that the repository still exists. If it is private, connect a GitHub token in Settings.',
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
  projects: 'Projects',
  projectCount: (n: number) => `${n} ${n === 1 ? 'app' : 'apps'} in the hangar`,
  settings: 'Settings',
  guide: 'Guide',
  signOut: 'Sign out',
  newProject: 'New project',
} as const

export const instrumentsCopy = {
  title: 'Instruments',
  cpu: 'CPU',
  memory: 'Memory',
  disk: 'Disk',
  images: 'App images',
  version: 'Version',
  waiting: 'Reading the instruments…',
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

export const authCopy = {
  signInTitle: 'Sign in to the Control Tower',
  username: 'Username',
  password: 'Password',
  signIn: 'Sign in',
  sessionExpired: 'Your session ended. Sign in again.',
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
  sections: [
    {
      title: 'Projects',
      body: 'A project is one app from one repository branch. Its name becomes its address: a project called blog is served at blog.<your address>.',
    },
    {
      title: 'Deployments',
      body: 'Each deployment builds one commit. Hangar downloads it, builds an image (with your Dockerfile, or by detecting the framework if there is none), starts it, and checks it answers. Only then does traffic switch over, so a broken build never takes your app down.',
    },
    {
      title: 'Statuses',
      body: 'Holding means waiting to build. Preflight means building. Taking off means starting and health-checking. Airborne means live. Grounded means it failed and the previous version kept serving. Scrubbed means it was cancelled.',
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
      target: 'instruments',
      title: 'Instruments',
      body: 'Live CPU, memory, and disk use of this server.',
    },
    {
      target: 'projects',
      title: 'Your projects',
      body: 'Each card shows the app, its address, and its recent deployments as a row of lights, newest on the right.',
    },
    {
      target: 'new-project',
      title: 'Add a project',
      body: 'Connect a repository here. Hangar deploys it right away.',
    },
    { target: 'guide', title: 'Guide', body: 'Come back here any time for a refresher.' },
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

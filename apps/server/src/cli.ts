// hangar-admin: administration from the server's command line. In production it runs inside
// hangar-core (`docker exec -it hangar-core hangar-admin …`); the installer calls it too.
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@hangar/shared'
import { ConfigError, loadConfig } from './config.ts'
import { createContext } from './context.ts'
import { createLogger } from './logger.ts'
import { issueSetupCode, resetPassword } from './modules/auth/service.ts'

const USAGE = `Usage: hangar-admin <command>

  issue-setup-code           Print a new one-time setup code (only before the first account exists)
  reset-password <username>  Set a new password, read from standard input; signs out all sessions`

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '')
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const config = loadConfig(process.env)
  const { ctx, close } = createContext(config, createLogger({ ...config, logLevel: 'warn' }))
  try {
    switch (command) {
      case 'issue-setup-code': {
        const code = await issueSetupCode(ctx)
        if (!code) {
          console.log('Hangar is already set up. Sign in with your account instead.')
          break
        }
        // Only the code goes to stdout, so the installer can capture it.
        console.log(code)
        break
      }
      case 'reset-password': {
        const [username] = args
        if (!username) throw new Error(USAGE)
        const password = await readStdin()
        if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
          throw new Error(
            `The password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`,
          )
        }
        await resetPassword(ctx, username, password)
        console.error(`Password changed for ${username}. All of its sessions were signed out.`)
        break
      }
      default:
        console.error(USAGE)
        process.exitCode = command ? 1 : 0
    }
  } finally {
    await close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError || error instanceof Error ? error.message : error)
  process.exit(1)
})

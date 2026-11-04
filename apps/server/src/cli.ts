// hangar-admin: administration from the server's command line. In production it runs inside
// hangar-core (`docker exec -it hangar-core hangar-admin …`); the installer calls it too.
import { createInterface } from 'node:readline'
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  publicTowerHostname,
  defaultDomain,
  schemas,
  sslipDomain,
  towerHostname,
} from '@hangar/shared'
import { ConfigError, loadConfig } from './config.ts'
import { createContext } from './context.ts'
import { createLogger } from './logger.ts'
import { issueSetupCode, resetPassword } from './modules/auth/service.ts'
import { getSettings } from './modules/settings/repo.ts'
import { updateSettings } from './modules/settings/service.ts'

const USAGE = `Usage: hangar-admin <command>

  issue-setup-code           Print a new one-time setup code (only before the first account exists)
  reset-password <username>  Set a new password, read from standard input; signs out all sessions
  set-lan-ip <address>       Change the address devices use to reach Hangar (if the server's IP
                             changed and the Control Tower no longer opens)
  set-public-tower <on|off>  Make the Control Tower public at hangar.<default domain>, or private`

/** The first line of standard input, so a typed password ends with Enter (no Ctrl+D needed). */
async function readLine(): Promise<string> {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
  try {
    for await (const line of lines) return line
    return ''
  } finally {
    lines.close()
  }
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
        // Through `docker exec -i` there is no terminal to hide the typing, so say so.
        console.error('Type the new password and press Enter (it shows as you type):')
        const password = await readLine()
        if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
          throw new Error(
            `The password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`,
          )
        }
        await resetPassword(ctx, username, password)
        console.error(`Password changed for ${username}. All of its sessions were signed out.`)
        break
      }
      case 'set-lan-ip': {
        const parsed = schemas.settingsPatch.shape.lanIp.safeParse(args[0])
        if (!parsed.success || !parsed.data) {
          throw new Error(`Enter an IPv4 address, like 192.168.1.50.\n\n${USAGE}`)
        }
        await updateSettings(ctx, { lanIp: parsed.data })
        const tower = towerHostname(sslipDomain(parsed.data))
        console.error(`Hangar now answers at http://${tower} and http://${parsed.data}`)
        break
      }
      case 'set-public-tower': {
        const [choice] = args
        if (choice !== 'on' && choice !== 'off') throw new Error(USAGE)
        await updateSettings(ctx, { exposeTowerPublicly: choice === 'on' })
        const domain = defaultDomain(await getSettings(ctx.db))
        console.error(
          choice === 'on'
            ? `The Control Tower is public at https://${publicTowerHostname(domain!)}`
            : 'The Control Tower is private again.',
        )
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

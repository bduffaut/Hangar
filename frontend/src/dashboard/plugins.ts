import { builtInWidgets } from '../components/widgets/index.ts'
import { installDashboardPlugin } from './registry.ts'
import type { DashboardPlugin } from './types.ts'

/**
 * Every dashboard plugin the Control Tower loads. To add your own widget library later:
 *   1. pnpm --filter @hangar/frontend add <your-package>
 *   2. import it here and add it to the list below.
 */
const plugins: DashboardPlugin[] = [builtInWidgets]

export function installDashboardPlugins(): void {
  for (const plugin of plugins) installDashboardPlugin(plugin)
}

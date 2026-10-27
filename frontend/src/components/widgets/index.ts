import { defineDashboardPlugin } from '../../dashboard/types.ts'
import ActivityWidget from './ActivityWidget.vue'
import InstrumentsWidget from './InstrumentsWidget.vue'
import OutcomesWidget from './OutcomesWidget.vue'
import ProjectsWidget from './ProjectsWidget.vue'

/** The Control Tower's own widgets, registered the same way an external library would. */
export const builtInWidgets = defineDashboardPlugin({
  name: 'hangar',
  install({ registerWidget }) {
    registerWidget({
      id: 'hangar.instruments',
      title: 'Instruments',
      description: 'Live CPU, memory, and disk use of this server.',
      component: InstrumentsWidget,
      size: 'full',
      enabledByDefault: true,
      order: 10,
    })
    registerWidget({
      id: 'hangar.projects',
      title: 'Projects',
      description: 'Every app with its address, status, and recent deployments.',
      component: ProjectsWidget,
      size: 'full',
      enabledByDefault: true,
      order: 20,
    })
    registerWidget({
      id: 'hangar.activity',
      title: 'Latest activity',
      description: 'The newest deployment of each project.',
      component: ActivityWidget,
      size: 'half',
      enabledByDefault: true,
      order: 30,
    })
    registerWidget({
      id: 'hangar.outcomes',
      title: 'Deployment results',
      description: 'How recent deployments ended, per project.',
      component: OutcomesWidget,
      size: 'half',
      enabledByDefault: true,
      order: 40,
    })
  },
})

import { dashboardCopy } from '@hangar/shared'
import { rowsFor } from '../../dashboard/layout.ts'
import { defineDashboardPlugin } from '../../dashboard/types.ts'
import ActivityWidget from './ActivityWidget.vue'
import DeparturesWidget from './DeparturesWidget.vue'
import GaugeWidget, { type Reading } from './GaugeWidget.vue'
import MachineWidget from './MachineWidget.vue'
import OutcomesWidget from './OutcomesWidget.vue'
import ProjectsWidget from './ProjectsWidget.vue'

const { widgets: copy, categories } = dashboardCopy
const GAUGES: Reading[] = ['cpu', 'memory', 'disk', 'temperature', 'battery', 'uptime']

/** The Control Tower's own widgets, registered the same way an external library would. */
export const builtInWidgets = defineDashboardPlugin({
  name: 'hangar',
  install({ registerWidget }) {
    registerWidget({
      id: 'hangar.departures',
      ...copy.departures,
      category: categories.traffic,
      component: DeparturesWidget,
      size: { w: 12, h: rowsFor(80), minW: 4 },
      sizeToContent: true,
    })
    registerWidget({
      id: 'hangar.projects',
      ...copy.projects,
      category: categories.traffic,
      component: ProjectsWidget,
      size: { w: 12, h: rowsFor(260), minW: 4 },
      sizeToContent: true,
    })
    registerWidget({
      id: 'hangar.activity',
      ...copy.activity,
      category: categories.traffic,
      component: ActivityWidget,
      size: { w: 6, h: rowsFor(200), minW: 3 },
      sizeToContent: true,
    })
    registerWidget({
      id: 'hangar.outcomes',
      ...copy.outcomes,
      category: categories.traffic,
      component: OutcomesWidget,
      size: { w: 6, h: rowsFor(240), minW: 3, minH: rowsFor(200) },
    })
    for (const reading of GAUGES) {
      registerWidget({
        id: `hangar.${reading}`,
        ...copy[reading],
        category: categories.instruments,
        component: GaugeWidget,
        props: { reading },
        size: {
          w: 2,
          h: rowsFor(200),
          minH: rowsFor(reading === 'uptime' ? 100 : 140),
        },
      })
    }
    registerWidget({
      id: 'hangar.machine',
      ...copy.machine,
      category: categories.machine,
      component: MachineWidget,
      size: { w: 12, h: rowsFor(96), minW: 4, minH: rowsFor(96) },
    })
  },
})

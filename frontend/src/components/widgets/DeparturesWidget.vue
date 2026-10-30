<script setup lang="ts">
import { type DeploymentStatus, statusCopy } from '@hangar/shared'
import { computed } from 'vue'
import { useNow } from '../../composables/useNow.ts'
import type { DashboardWidgetProps } from '../../dashboard/index.ts'
import { formatDuration, relativeTime } from '../../lib/format.ts'

// Deployments under way, each drawn as a route through the four stages a deployment passes:
// holding, build, takeoff (start and health check), airborne. Legs flown are solid magenta, the
// leg in progress is a moving dashed line, legs ahead are faint. With nothing under way it says
// when the last deployment landed.
const props = defineProps<DashboardWidgetProps>()
const now = useNow(1000)

const WAYPOINTS: DeploymentStatus[] = ['queued', 'building', 'deploying', 'ready']

const projectsById = computed(() => new Map(props.data.projects.value.map((p) => [p.id, p])))

const flights = computed(() =>
  [...props.data.activeDeployments.value]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((d) => ({
      deployment: d,
      project: projectsById.value.get(d.projectId)?.name ?? 'App',
      stage: WAYPOINTS.indexOf(d.status),
    })),
)

const lastLanded = computed(
  () =>
    props.data.projects.value
      .flatMap((p) =>
        p.latest && p.latest.finishedAt ? [{ project: p.name, deployment: p.latest }] : [],
      )
      .sort((a, b) => b.deployment.finishedAt!.localeCompare(a.deployment.finishedAt!))[0],
)
</script>

<template>
  <div class="hg-departures" data-tour="departures">
    <p v-if="flights.length === 0" class="hg-departures-quiet">
      Nothing deploying.
      <template v-if="lastLanded">
        Last:
        <RouterLink :to="{ name: 'deployment', params: { id: lastLanded.deployment.id } }"
          >{{ lastLanded.project }} #{{ lastLanded.deployment.number }}</RouterLink
        >,
        {{ statusCopy[lastLanded.deployment.status].label.toLowerCase() }}
        {{ relativeTime(lastLanded.deployment.finishedAt!, now) }}.
      </template>
    </p>

    <ol v-else class="hg-flights">
      <li v-for="flight in flights" :key="flight.deployment.id">
        <RouterLink
          :to="{ name: 'deployment', params: { id: flight.deployment.id } }"
          class="hg-flight"
        >
          <span class="hg-flight-name">
            <strong>{{ flight.project }}</strong>
            <span class="hg-muted">#{{ flight.deployment.number }}</span>
          </span>

          <span
            class="hg-route"
            role="img"
            :aria-label="`${statusCopy[flight.deployment.status].label}: ${statusCopy[flight.deployment.status].meaning}`"
          >
            <template v-for="(stage, i) in WAYPOINTS" :key="stage">
              <span
                v-if="i > 0"
                class="hg-leg"
                :class="{
                  'is-flown': i <= flight.stage,
                  'is-flying': i === flight.stage + 1,
                }"
              />
              <span
                class="hg-waypoint"
                :class="{ 'is-passed': i < flight.stage, 'is-here': i === flight.stage }"
              >
                <span class="hg-waypoint-mark" aria-hidden="true" />
                <span class="hg-waypoint-name">{{ statusCopy[stage].label }}</span>
              </span>
            </template>
          </span>

          <span class="hg-flight-time hg-data">{{
            formatDuration(now - Date.parse(flight.deployment.createdAt))
          }}</span>
        </RouterLink>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.hg-departures {
  container-type: inline-size;
  padding: 0 var(--hg-space-4) var(--hg-space-4);
}
.hg-departures-quiet {
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
}
.hg-flights {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--hg-space-1);
}
.hg-flight {
  display: grid;
  grid-template-columns: minmax(8rem, 12rem) 1fr 4.5rem;
  align-items: center;
  gap: var(--hg-space-5);
  padding: var(--hg-space-3) var(--hg-space-2);
  margin: 0 calc(-1 * var(--hg-space-2));
  border-radius: var(--hg-radius-md);
  color: inherit;
  text-decoration: none;
  transition: background-color var(--hg-motion-fast) var(--hg-motion-easing);
}
.hg-flight:hover {
  background: var(--hg-raised);
}
.hg-flight-name {
  display: flex;
  gap: var(--hg-space-2);
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.hg-flight-time {
  text-align: right;
  font-size: var(--hg-size-sm);
  color: var(--hg-ink-muted);
}
/* The route: waypoints joined by legs, labels under the marks. */
.hg-route {
  display: flex;
  align-items: flex-start;
  padding-bottom: 1.1rem;
}
.hg-waypoint {
  position: relative;
  flex: none;
  display: flex;
  justify-content: center;
}
.hg-waypoint-mark {
  width: 0.6rem;
  height: 0.6rem;
  margin-top: 0.05rem;
  transform: rotate(45deg);
  border: 1.5px solid var(--hg-line);
  background: var(--hg-panel);
  transition:
    background-color var(--hg-motion-base) var(--hg-motion-easing),
    border-color var(--hg-motion-base) var(--hg-motion-easing);
}
.is-passed .hg-waypoint-mark {
  background: var(--hg-accent);
  border-color: var(--hg-accent);
}
/* Where the deployment is now: the aircraft symbol of a navigation display. */
.is-here .hg-waypoint-mark {
  width: 1.1rem;
  height: 1rem;
  margin-top: -0.2rem;
  transform: none;
  border: 0;
  background: var(--hg-accent);
  clip-path: polygon(50% 0, 100% 100%, 50% 78%, 0 100%);
  rotate: 90deg;
}
.hg-waypoint-name {
  position: absolute;
  top: 1.05rem;
  font-size: var(--hg-size-xs);
  color: var(--hg-ink-muted);
  white-space: nowrap;
}
.is-here .hg-waypoint-name {
  color: var(--hg-ink);
}
.hg-waypoint:first-child .hg-waypoint-name {
  left: -0.1rem;
}
.hg-waypoint:last-child .hg-waypoint-name {
  right: -0.1rem;
}
.hg-leg {
  flex: 1;
  height: 2px;
  margin-top: 0.33rem;
  background: var(--hg-line);
}
.hg-leg.is-flown {
  background: var(--hg-accent);
}
.hg-leg.is-flying {
  background: repeating-linear-gradient(90deg, var(--hg-accent) 0 6px, transparent 6px 11px);
  background-size: 22px 2px;
  animation: hg-fly 0.9s linear infinite;
}
@keyframes hg-fly {
  to {
    background-position: 22px 0;
  }
}
@container (max-width: 36rem) {
  .hg-flight {
    grid-template-columns: 1fr auto;
    row-gap: var(--hg-space-2);
  }
  .hg-route {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>

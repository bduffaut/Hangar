import type { MetricsSample } from '@hangar/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { openStream, type Stream, streamUrl } from '../api/streams.ts'

/**
 * Host and container metrics. The server samples only while someone listens, so components
 * `acquire()` the stream while they are on screen and `release()` it after.
 */
export const useMetricsStore = defineStore('metrics', () => {
  const samples = ref<MetricsSample[]>([])
  let users = 0
  let stream: Stream | null = null

  const latest = computed(() => samples.value.at(-1) ?? null)

  /** The last samples of one project's container, oldest first. */
  function seriesFor(projectId: string) {
    return samples.value.map((s) => ({
      ts: s.ts,
      value: s.containers.find((c) => c.projectId === projectId) ?? null,
    }))
  }

  return {
    samples,
    latest,
    seriesFor,
    acquire() {
      users++
      if (stream) return
      stream = openStream(streamUrl('metrics'), {
        history: (data: { samples: MetricsSample[] }) => (samples.value = data.samples),
        sample: (sample: MetricsSample) => {
          samples.value = [...samples.value.slice(-179), sample]
        },
      })
    },
    release() {
      users = Math.max(0, users - 1)
      if (users === 0) {
        stream?.close()
        stream = null
      }
    },
  }
})

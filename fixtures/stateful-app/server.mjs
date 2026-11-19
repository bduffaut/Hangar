// Counts its own starts in /data, which Hangar keeps across deploys: the body says how many
// times the app has started on the same storage.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'

mkdirSync('/data', { recursive: true })
let starts = 0
try {
  starts = Number(readFileSync('/data/starts', 'utf8')) || 0
} catch {
  // The first start: nothing counted yet.
}
starts += 1
writeFileSync('/data/starts', String(starts))

http
  .createServer((_req, res) => res.end(`fixture: stateful-app starts=${starts}`))
  .listen(8080, '0.0.0.0')

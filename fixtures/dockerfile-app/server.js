import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'

const buildSecret = readFileSync('build-secret', 'utf8').trim()
const greeting = process.env.GREETING ?? 'none'

createServer((_req, res) => {
  res.end(`fixture: dockerfile-app greeting=${greeting} build-secret=${buildSecret}\n`)
}).listen(8080)

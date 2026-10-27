import express from 'express'

const app = express()
app.get('/', (_req, res) => res.send('fixture: node-express'))
app.listen(Number(process.env.PORT ?? 3000))

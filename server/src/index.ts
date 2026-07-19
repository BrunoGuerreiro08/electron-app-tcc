import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { initSchema } from './db.js'
import { authRoutes } from './routes/auth.js'

const app = new Hono()

app.use('*', cors())

app.get('/health', (c) => c.json({ ok: true }))
app.route('/auth', authRoutes)

const port = Number(process.env.PORT ?? 3000)

initSchema()
    .then(() => {
        serve({ fetch: app.fetch, port })
        console.log(`Server listening on http://localhost:${port}`)
    })
    .catch((err) => {
        console.error('Failed to initialize schema:', err)
        process.exit(1)
    })
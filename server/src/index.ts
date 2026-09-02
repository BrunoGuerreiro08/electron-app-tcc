import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { initSchema } from './db.js'
import { authRoutes } from './routes/auth.js'

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

const app = new Hono()

app.use('*', cors())

app.get('/health', (c) => c.json({ ok: true }))
app.route('/auth', authRoutes)

const port = Number(process.env.PORT ?? 3000)


function startServer(retryCount = 0) {
    initSchema()
        .then(() => {
            serve({ fetch: app.fetch, port });
            console.log(`Server listening on http://localhost:${port}`);
        })
        .catch((err) => {
            console.error(`Failed to initialize schema (Attempt ${retryCount + 1}/${MAX_RETRIES}):`, err.message);

            if (retryCount < MAX_RETRIES - 1) {
                console.log(`Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
                setTimeout(() => startServer(retryCount + 1), RETRY_DELAY_MS);
            } else {
                console.error('Max retries reached. Exiting...');
                process.exit(1);
            }
        });
}


startServer();
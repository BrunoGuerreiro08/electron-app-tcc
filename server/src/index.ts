import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getServerId, initSchema } from './db.js'
import { ALLOWED_EMAIL_DOMAINS, INSTITUTION_NAME } from './emailPolicy.js'
import { authRoutes } from './routes/auth.js'
import { templateRoutes } from './routes/templates.js'
import { syncRoutes } from './routes/sync.js'

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

const app = new Hono()

// Must stay open: the desktop renderer calls from a file:// origin (Origin: null).
// Safe because auth is a bearer token, never a cookie.
app.use('*', cors())

app.get('/health', async (c) =>
    c.json({
        ok: true,
        app: 'docenti',
        serverId: await getServerId(),
        apiVersion: 1,
        institutionName: INSTITUTION_NAME,
        allowedEmailDomains: ALLOWED_EMAIL_DOMAINS,
    })
)
app.route('/auth', authRoutes)
app.route('/templates', templateRoutes)
app.route('/sync', syncRoutes)

const port = Number(process.env.PORT ?? 3000)


function startServer(retryCount = 0) {
    initSchema()
        .then(() => {
            serve({ fetch: app.fetch, port });
            console.log(`Server listening on http://localhost:${port}`);
            if (ALLOWED_EMAIL_DOMAINS.length === 0) {
                console.warn('ALLOWED_EMAIL_DOMAINS not set — any email can sign in.');
            }
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
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { auth } from './routes/auth';
import { options } from './routes/options';
import { schedules } from './routes/schedules';
import { users } from './routes/users';
import { jsonError } from './lib/http';
import { protectWrites } from './middleware/auth';
import type { AppBindings } from './types';

const app = new Hono<AppBindings>();

app.use('/api/*', logger());
app.use('/api/*', protectWrites);
app.get('/api/health', (c) => c.json({ data: { status: 'ok' } }));
app.route('/api/auth', auth);
app.route('/api/users', users);
app.route('/api/schedules', schedules);
app.route('/api/schedule-options', options);
app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404));
app.onError((error, c) => jsonError(c, error));

export default app;


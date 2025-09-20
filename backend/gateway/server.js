import express from 'express';
import cors from 'cors';
import { ENV } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { registerUploadRoutes } from './routes/uploads.js';
import { registerConvertRoutes } from './routes/convert.js';
import { registerJobRoutes } from './routes/jobs.js';
import { registerAiChatRoutes } from './routes/aiChat.js';

const app = express();
app.use(cors());
app.use(express.json());

const prefix = '/api/v1';
registerUploadRoutes(app, prefix);
registerConvertRoutes(app, prefix);
registerJobRoutes(app, prefix);
registerAiChatRoutes(app, prefix);

app.get(prefix + '/health', (_req,res) => res.json({ ok:true }));

app.use((err, _req, res, _next) => {
  logger.error('Unhandled', err);
  res.status(500).json({ error:'internal_error'});
});

app.listen(ENV.PORT, () => logger.info(`Backend listening on ${ENV.PORT}`));

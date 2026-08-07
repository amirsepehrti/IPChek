import path from 'node:path';
import express from 'express';
import config from './config.js';
import api from './routes/api.js';
import { startScheduler, stopScheduler } from './core/scheduler.js';
import { createLogger } from './lib/logger.js';

const log = createLogger('server');

export function createApp() {
  const app = express();

  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  // Export URLs are meant to be polled by routers and firewalls from anywhere.
  app.use((req, res, next) => {
    res.set('access-control-allow-origin', '*');
    res.set('access-control-allow-headers', 'content-type, authorization');
    res.set('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use('/api', api);

  app.use(
    express.static(path.join(config.root, 'public'), {
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.set('cache-control', 'no-cache');
      },
    }),
  );

  app.use('/api', (req, res) => res.status(404).json({ error: 'not found', path: req.originalUrl }));
  app.use((req, res) => res.sendFile(path.join(config.root, 'public', 'index.html')));

  // Four parameters: this is how Express recognises an error handler.
  app.use((error, req, res, next) => {
    const status = error.status || 500;
    if (status >= 500) log.error(error.stack || error.message);
    else log.debug(`${status} ${req.method} ${req.originalUrl}: ${error.message}`);
    res.status(status).json({ error: error.message || 'internal error' });
  });

  return app;
}

export function start() {
  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    log.info(`IPChek ${config.version} listening on http://${config.host}:${config.port}`);
    log.info(`default source: ${config.defaultSource} · data: ${config.dataDir}`);
    startScheduler();
  });

  const shutdown = (signal) => {
    log.info(`${signal} received, shutting down`);
    stopScheduler();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) start();

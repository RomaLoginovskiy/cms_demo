import express from 'express';
import path from 'path';
import { BrowserLoadEngine } from '../engine/BrowserLoadEngine';
import { getMetricsText } from '../metrics/prometheus';
import { LoadConfig } from '../config/types';
import { coerceTargetUrl, resolveTargetUrl } from '../config/resolveTargetUrl';
import { validateMergedConfig } from '../config/applyConfig';
import { RUM_DEMO_BATCH_PRESETS, RUM_DEMO_SCENARIOS, isKnownRumBatchPreset, isKnownRumScenario } from '../rum/rumDemoCatalog';
import { registerSeedBoardRoute } from './seedBoardRoute';

export function createControlServer(engine: BrowserLoadEngine, config: LoadConfig): express.Application {
  const app = express();
  app.use(express.json());

  const wwwRoot = path.join(__dirname, '../../wwwroot');
  app.use(
    express.static(wwwRoot, {
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
          res.setHeader('Cache-Control', 'no-store');
        }
      }
    })
  );
  app.get('/', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(wwwRoot, 'index.html'));
  });

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', phase: engine.getPhase() });
  });

  app.get('/api/control/state', (_req, res) => {
    res.json(engine.getStateSnapshot());
  });

  app.get('/api/control/config', (_req, res) => {
    const cfg = engine.getConfig();
    const resolved = resolveTargetUrl(cfg);
    res.json({
      ...cfg,
      target: {
        ...cfg.target,
        effective_frontend_base_url: resolved.url
      }
    });
  });

  app.put('/api/control/config', async (req, res) => {
    const body = req.body as Partial<LoadConfig>;
    const { errors } = validateMergedConfig(engine.getConfig(), body);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }
    engine.mergeConfig(body);
    res.json({ applied: true, effective: engine.getConfig() });
  });

  app.post('/api/control/reload-target', async (req, res) => {
    const body = req.body as { frontend_base_url?: string };
    const raw = body.frontend_base_url?.trim();
    if (!raw) {
      res.status(400).json({ error: 'frontend_base_url required' });
      return;
    }
    const url = coerceTargetUrl(raw);
    try {
      await engine.reconfigureTarget(url);
      res.json(engine.getStateSnapshot());
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });

  app.post('/api/control/pause', async (_req, res) => {
    await engine.pause();
    res.json(engine.getStateSnapshot());
  });

  app.post('/api/control/resume', async (_req, res) => {
    try {
      await engine.resume();
      res.json(engine.getStateSnapshot());
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : String(err),
        ...engine.getStateSnapshot()
      });
    }
  });

  app.post('/api/control/scenario/:name', async (req, res) => {
    try {
      await engine.applyScenario(req.params.name!);
      res.json(engine.getStateSnapshot());
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/control/rum/scenarios', (_req, res) => {
    res.json({
      scenarios: RUM_DEMO_SCENARIOS,
      batchPresets: RUM_DEMO_BATCH_PRESETS
    });
  });

  app.post('/api/control/rum/scenario/:id', async (req, res) => {
    const id = req.params.id?.toLowerCase() ?? '';
    if (!isKnownRumScenario(id)) {
      res.status(400).json({ error: `Unknown RUM scenario: ${id}` });
      return;
    }
    try {
      const body = (req.body ?? {}) as {
        plan?: 'free' | 'enterprise' | 'team';
        version?: string;
        releaseRing?: string;
        featureArea?: string;
        demoGeo?: string;
        demoBrowserFamily?: string;
      };
      engine.applyRumScenario(id, body);
      res.json(engine.getStateSnapshot());
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/control/rum/batch/:preset', async (req, res) => {
    const preset = req.params.preset ?? '';
    if (!isKnownRumBatchPreset(preset)) {
      res.status(400).json({ error: `Unknown RUM batch preset: ${preset}` });
      return;
    }
    try {
      engine.applyRumBatchPreset(preset);
      res.json(engine.getStateSnapshot());
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/control/rum/disable', async (_req, res) => {
    try {
      engine.disableRumDemo();
      res.json(engine.getStateSnapshot());
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  registerSeedBoardRoute(app, engine);

  return app;
}

export function startMetricsServer(port: number, engine?: BrowserLoadEngine): void {
  const metricsApp = express();
  metricsApp.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', phase: engine?.getPhase() ?? 'unknown' });
  });
  metricsApp.get('/metrics', async (_req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(await getMetricsText());
  });
  metricsApp.listen(port, () => {
    console.log(`Metrics listening on :${port}`);
  });
}

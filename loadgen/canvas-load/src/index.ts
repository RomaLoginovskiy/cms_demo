import { loadConfig, resolveConfigPath } from './config/loadConfig';
import { BrowserLoadEngine } from './engine/BrowserLoadEngine';
import { startLeaderSync } from './engine/leaderSync';
import { createControlServer, startMetricsServer } from './control/server';

function parseArgs(): { configPath?: string; scenario?: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let configPath: string | undefined;
  let scenario: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      configPath = args[++i];
    } else if (args[i] === '--scenario' && args[i + 1]) {
      scenario = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  return { configPath, scenario, dryRun };
}

async function main(): Promise<void> {
  const { configPath: cliPath, scenario: cliScenario, dryRun } = parseArgs();
  const configPath = resolveConfigPath(cliPath);

  let config;
  try {
    config = await loadConfig({ configPath, scenario: cliScenario });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (dryRun) {
    console.log(JSON.stringify(config, null, 2));
    process.exit(0);
  }

  const engine = new BrowserLoadEngine(config);
  const plan = engine.getShardPlan();

  startMetricsServer(config.control.metrics_port, engine);

  if (engine.isControlPlane()) {
    const app = createControlServer(engine, config);
    app.listen(config.control.listen_port, () => {
      console.log(`Control UI http://0.0.0.0:${config.control.listen_port}`);
      console.log(
        `Shard ${plan.shardIndex + 1}/${plan.shardCount}; ${plan.localCount} users on this pod (${plan.totalUsers} total)`
      );
      console.log(`Target ${config.target.frontend_base_url}`);
    });
  } else {
    console.log(
      `Worker shard ${plan.shardIndex + 1}/${plan.shardCount}; ${plan.localCount} users (global index ${plan.globalIndexOffset}+)`
    );
    startLeaderSync(engine);
  }

  await engine.start();

  const shutdown = async () => {
    console.log('Shutting down...');
    await engine.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

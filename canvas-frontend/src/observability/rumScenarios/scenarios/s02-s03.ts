import { RumScenarioDefinition } from '../types';
import { emitStableError } from '../helpers';
import { setScenarioActiveFlag } from '../scenarioFlags';

export const s02BoardLoadAbandon: RumScenarioDefinition = {
  id: 's02',
  title: 'Board-load failure',
  useCase: 'UC1',
  description: 'miro.board.load.started without fullyInteractive',
  activate() {
    setScenarioActiveFlag('s02_abandon_load', true);
    return () => setScenarioActiveFlag('s02_abandon_load', false);
  }
};

export const s03GeoBrowserCluster: RumScenarioDefinition = {
  id: 's03',
  title: 'Geographic / browser clustering',
  useCase: 'UC1',
  description: 'Same error across sessions with demo_geo / demo_browser_family labels',
  activate(ctx) {
    const timerId = ctx.schedule(() => {
      emitStableError('GeoClusterDemo: shared widget sync failure', 'critical', {
        demo_geo: ctx.config.demoGeo ?? 'unknown',
        demo_browser_family: ctx.config.demoBrowserFamily ?? 'unknown'
      });
    }, 3000);
    return () => ctx.clearSchedule(timerId);
  },
  runOnce(ctx) {
    emitStableError('GeoClusterDemo: shared widget sync failure', 'critical', {
      demo_geo: ctx.config.demoGeo ?? 'unknown',
      demo_browser_family: ctx.config.demoBrowserFamily ?? 'unknown'
    });
  }
};

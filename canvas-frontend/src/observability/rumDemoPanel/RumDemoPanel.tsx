import { useMemo, useState } from 'react';
import {
  buildSessionQuery,
  clearPanelOverrides,
  isRumDemoInjectorsAllowed,
  parseRumSessionConfig,
  RumPlan,
  RumReleaseRing,
  RumScenarioId,
  savePanelOverrides
} from '../rumSessionConfig';
import { getRumDemoStats, getRumLabelSnapshot } from '../rumLabelContext';
import { getRumSessionConfig } from '../coralogixRum';
import { groupScenariosByUseCase } from '../rumScenarios/registry';
import { runScenarioOnce } from '../rumScenarios/activate';

export function RumDemoPanel(): JSX.Element | null {
  const sessionConfig = getRumSessionConfig();
  const grouped = useMemo(() => groupScenariosByUseCase(), []);
  const [plan, setPlan] = useState<RumPlan>(sessionConfig.plan);
  const [version, setVersion] = useState(sessionConfig.version);
  const [releaseRing, setReleaseRing] = useState<RumReleaseRing>(sessionConfig.releaseRing);
  const [featureArea, setFeatureArea] = useState(sessionConfig.featureArea);
  const [scenarioId, setScenarioId] = useState<RumScenarioId | ''>(sessionConfig.scenarioId ?? '');
  const stats = getRumDemoStats();
  const labels = getRumLabelSnapshot();

  if (!sessionConfig.showPanel && !sessionConfig.demoEnabled) {
    return null;
  }

  const blocked = sessionConfig.demoEnabled && !isRumDemoInjectorsAllowed(sessionConfig);

  function applyAndReload(): void {
    savePanelOverrides({
      plan,
      version,
      releaseRing,
      featureArea,
      scenarioId: scenarioId || null
    });
    const query = buildSessionQuery({
      plan,
      version,
      releaseRing,
      featureArea,
      scenarioId: scenarioId || null,
      rumDemo: true
    });
    const path = window.location.pathname;
    window.location.href = `${path}?${query}`;
  }

  function runOnce(): void {
    const config = parseRumSessionConfig(window.__APP_CONFIG__ ?? {}, `?${buildSessionQuery({
      plan,
      version,
      releaseRing,
      featureArea,
      scenarioId: scenarioId || null,
      rumDemo: true
    })}`);
    runScenarioOnce(config);
  }

  function resetOverrides(): void {
    clearPanelOverrides();
    window.location.href = window.location.pathname;
  }

  return (
    <aside className="rum-demo-panel rr-mask" data-testid="rum-demo-panel">
      <header>
        <strong>RUM Demo</strong>
        {blocked && <span className="rum-demo-banner">Blocked in production (set RUM_DEMO_ALLOW_PROD)</span>}
      </header>
      <div className="rum-demo-scenario-section">
        <div className="rum-demo-scenario-section__header">
          <span>Scenario</span>
          {scenarioId && (
            <button
              type="button"
              className="rum-demo-scenario-clear"
              onClick={() => setScenarioId('')}
            >
              Clear
            </button>
          )}
        </div>
        <div className="rum-demo-scenario-scroll" data-testid="rum-demo-scenario">
          {Object.entries(grouped).map(([useCase, scenarios]) => (
            <div key={useCase} className="rum-demo-scenario-group">
              <div className="rum-demo-scenario-group__label">{useCase}</div>
              <div className="rum-demo-scenario-grid">
                {scenarios.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className="rum-demo-scenario-card"
                    data-uc={s.useCase}
                    aria-pressed={scenarioId === s.id}
                    data-testid={`rum-demo-scenario-${s.id}`}
                    onClick={() => setScenarioId(scenarioId === s.id ? '' : s.id)}
                  >
                    <span className="rum-demo-scenario-card__header">
                      <span className="rum-demo-scenario-card__id">{s.id}</span>
                      <span className="rum-demo-scenario-card__uc">{s.useCase}</span>
                    </span>
                    <span className="rum-demo-scenario-card__title">{s.title}</span>
                    <span className="rum-demo-scenario-card__desc">{s.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <label>
        Plan
        <select value={plan} onChange={e => setPlan(e.target.value as RumPlan)} data-testid="rum-demo-plan">
          <option value="free">free</option>
          <option value="team">team</option>
          <option value="enterprise">enterprise</option>
        </select>
      </label>
      <label>
        Version
        <input value={version} onChange={e => setVersion(e.target.value)} data-testid="rum-demo-version" />
      </label>
      <label>
        Release ring
        <select value={releaseRing} onChange={e => setReleaseRing(e.target.value as RumReleaseRing)}>
          <option value="stable">stable</option>
          <option value="canary">canary</option>
          <option value="internal">internal</option>
        </select>
      </label>
      <label>
        Feature area
        <input value={featureArea} onChange={e => setFeatureArea(e.target.value)} />
      </label>
      <div className="rum-demo-stats">
        <span>widgetCount: {labels.widgetCount}</span>
        <span>dropped: {stats.dropped}</span>
        <span>errors: {stats.errorsEmitted}</span>
        <span>journeys: {stats.journeyEventsEmitted}</span>
      </div>
      <div className="rum-demo-actions">
        <button type="button" onClick={runOnce} data-testid="rum-demo-run-once">Run once</button>
        <button type="button" onClick={applyAndReload} data-testid="rum-demo-apply">Apply &amp; reload</button>
        <button type="button" onClick={resetOverrides}>Reset</button>
      </div>
    </aside>
  );
}

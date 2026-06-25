const MIX_KEYS = ['lurker', 'active_drawer', 'collaborator', 'admin', 'media_placer'];

const dirty = {
  target: false,
  users: false,
  mix: false,
  sessionPacing: false
};

const SESSION_PACING_WORKSHOP = {
  long_fraction_pct: 25,
  normal_min: 3,
  long_min: 12,
  long_think_multiplier: 3
};

let autoFixedClusterTarget = false;
let mixDomReady = false;
let rumCatalogLoaded = false;
let seedInProgress = false;

function formatApiError(err, fallback) {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (err.error) return err.error;
  if (err.message) return err.message;
  if (Array.isArray(err.errors) && err.errors.length) return err.errors.join('\n');
  return fallback;
}

function api(path, opts) {
  return fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  }).then(async r => {
    let data;
    try {
      data = await r.json();
    } catch {
      throw { error: r.ok ? 'Invalid JSON response' : `HTTP ${r.status}` };
    }
    if (!r.ok) throw data;
    return data;
  });
}

function setDirty(section, isDirty) {
  dirty[section] = isDirty;
  const hintId =
    section === 'target'
      ? 'target-dirty-hint'
      : section === 'users'
        ? 'users-dirty-hint'
        : section === 'sessionPacing'
          ? 'session-pacing-dirty-hint'
          : 'mix-dirty-hint';
  const el = document.getElementById(hintId);
  if (el) el.classList.toggle('visible', isDirty);
}

function isLocalhostTarget(url) {
  return /localhost|127\.0\.0\.1/.test(url || '');
}

function buildMixDom() {
  const root = document.getElementById('mix-sliders');
  root.innerHTML = '';
  MIX_KEYS.forEach(key => {
    const row = document.createElement('div');
    row.className = 'mix-row';
    row.innerHTML = `
      <label for="mix-${key}">${key}</label>
      <input type="number" id="mix-${key}" data-mix="${key}" min="0" max="100" step="1" value="0" />
      <span data-mix-val="${key}">%</span>
    `;
    root.appendChild(row);
    const input = row.querySelector(`[data-mix="${key}"]`);
    input.addEventListener('input', () => {
      setDirty('mix', true);
      updateMixTotal();
    });
  });
  mixDomReady = true;
}

function readMixWeights() {
  const weights = {};
  let total = 0;
  MIX_KEYS.forEach(key => {
    const el = document.querySelector(`[data-mix="${key}"]`);
    const w = Math.max(0, parseInt(el?.value, 10) || 0);
    weights[key] = w;
    total += w;
  });
  return { weights, total };
}

function normalizeMix(weights) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const mix = {};
  if (sum <= 0) {
    MIX_KEYS.forEach(key => {
      mix[key] = key === 'lurker' ? 1 : 0;
    });
    return mix;
  }
  MIX_KEYS.forEach(key => {
    mix[key] = weights[key] / sum;
  });
  return mix;
}

function displayMixPercents(mix) {
  MIX_KEYS.forEach(key => {
    const input = document.querySelector(`[data-mix="${key}"]`);
    if (input) input.value = Math.round((mix[key] ?? 0) * 100);
  });
  updateMixTotal();
}

function updateMixTotal() {
  const { total } = readMixWeights();
  const el = document.getElementById('mix-total');
  if (el) el.textContent = String(total);
}

async function putConfig(partial) {
  const result = await api('/api/control/config', { method: 'PUT', body: JSON.stringify(partial) });
  return result;
}

function readSessionPacingFromDom() {
  const enabled = document.getElementById('session-pacing-enabled').checked;
  const longPct = parseInt(document.getElementById('session-pacing-long-pct').value, 10);
  const normalMin = parseInt(document.getElementById('session-pacing-normal-min').value, 10);
  const longMin = parseInt(document.getElementById('session-pacing-long-min').value, 10);
  const thinkMult = parseFloat(document.getElementById('session-pacing-think-mult').value);

  return {
    enabled,
    long_fraction: Math.min(1, Math.max(0, (Number.isFinite(longPct) ? longPct : 0) / 100)),
    normal_profile_max_duration_ms:
      (Number.isFinite(normalMin) ? normalMin : 3) * 60_000,
    long_profile_max_duration_ms: (Number.isFinite(longMin) ? longMin : 12) * 60_000,
    long_think_multiplier: Number.isFinite(thinkMult) ? thinkMult : 3
  };
}

function syncSessionPacingFromConfig(cfg) {
  const sp = cfg.users.session_pacing;
  if (!sp || dirty.sessionPacing) return;

  document.getElementById('session-pacing-enabled').checked = !!sp.enabled;
  document.getElementById('session-pacing-long-pct').value = Math.round((sp.long_fraction ?? 0.25) * 100);
  document.getElementById('session-pacing-normal-min').value = Math.round(
    (sp.normal_profile_max_duration_ms ?? 180_000) / 60_000
  );
  document.getElementById('session-pacing-long-min').value = Math.round(
    (sp.long_profile_max_duration_ms ?? 720_000) / 60_000
  );
  document.getElementById('session-pacing-think-mult').value = sp.long_think_multiplier ?? 3;
}

function syncUsersFromConfig(cfg) {
  const usersInput = document.getElementById('users');
  const thinkInput = document.getElementById('think-time');
  const chaosInput = document.getElementById('chaos');

  usersInput.min = '1';
  usersInput.removeAttribute('max');

  if (!dirty.users) {
    usersInput.value = cfg.users.count;
    thinkInput.value = cfg.users.think_time_ms;
    chaosInput.checked = cfg.chaos.enabled;
  }

  syncSessionPacingFromConfig(cfg);
}

function syncMixFromConfig(mix) {
  if (!dirty.mix) {
    displayMixPercents(mix);
  }
}

async function refresh() {
  const state = await api('/api/control/state');
  const cfg = await api('/api/control/config');

  if (
    !autoFixedClusterTarget &&
    state.inCluster &&
    isLocalhostTarget(cfg.target.frontend_base_url)
  ) {
    autoFixedClusterTarget = true;
    try {
      await api('/api/control/reload-target', {
        method: 'POST',
        body: JSON.stringify({ frontend_base_url: 'http://canvas-frontend' })
      });
      setDirty('target', false);
      return refresh();
    } catch {
      /* show hint below */
    }
  }

  const status = document.getElementById('status');
  let cls = 'status';
  if (!state.frontendReachable) cls += ' frontend-down';
  else if (state.degraded) cls += ' degraded';
  if (state.inCluster && isLocalhostTarget(state.effectiveTargetUrl)) cls += ' frontend-down';
  status.className = cls;

  const lines = [
    state.statusMessage || '',
    `Phase: ${state.phase}`,
    `Users: ${state.activeContexts}/${state.targetContexts} on pod` +
      (state.totalTargetUsers
        ? ` (${state.totalTargetUsers} total, shard ${(state.shard?.index ?? 0) + 1}/${state.shard?.count ?? 1})`
        : ''),
    `Target: ${state.effectiveTargetUrl || state.targetUrl}${state.effectiveTargetUrl && state.targetUrl && state.effectiveTargetUrl !== state.targetUrl ? ` (config: ${state.targetUrl})` : ''}`,
    `Error rate: ${(state.errorRate * 100).toFixed(1)}%`,
    `Frontend: ${state.frontendReachable ? 'ok' : 'DOWN'}`,
    `CMS: ${state.cmsReachable ? 'ok' : 'down'}`,
    `Actions: ${state.counters?.actionsTotal ?? 0} (failed ${state.counters?.actionsFailed ?? 0})`
  ].filter(Boolean);
  status.textContent = lines.join(' | ');

  const hint = document.getElementById('target-hint');
  if (state.inCluster && isLocalhostTarget(state.effectiveTargetUrl)) {
    hint.innerHTML =
      '<strong>Invalid in Kubernetes:</strong> <code>localhost</code> is the load pod, not the canvas app. Use <code>http://canvas-frontend</code> and click Apply target.';
  } else if (!state.frontendReachable) {
    hint.innerHTML = state.inCluster
      ? `From inside the cluster, canvas is at <code>http://canvas-frontend</code> (not host <code>localhost</code>).<br/>
         Your browser may use <a href="http://localhost/" target="_blank">http://localhost/</a> via ingress — that path does not apply here.`
      : `Start canvas-frontend, then set target to <code>http://localhost</code> or <code>http://localhost:3000</code> for webpack dev.`;
  } else {
    hint.innerHTML = state.inCluster
      ? 'Running in Kubernetes — target must be <code>http://canvas-frontend</code>.'
      : '';
  }

  syncUsersFromConfig(cfg);

  const targetInput = document.getElementById('target-url');
  const effectiveTarget =
    cfg.target?.effective_frontend_base_url || cfg.target.frontend_base_url;
  if (!dirty.target && document.activeElement !== targetInput) {
    targetInput.value = cfg.target.frontend_base_url;
  }
  if (effectiveTarget && effectiveTarget !== cfg.target.frontend_base_url && !dirty.target) {
    targetInput.title = `Playwright uses ${effectiveTarget} (env/cluster override)`;
  }

  if (!mixDomReady) buildMixDom();
  syncMixFromConfig(cfg.profiles.mix);

  document.getElementById('frontend-link').href = cfg.target.frontend_base_url;

  document.getElementById('errors').textContent =
    (state.recentErrors || [])
      .map(e => `${e.ts} [${e.profile}] ${e.action}: ${e.error || 'ok'}`)
      .join('\n') || '(none)';

  syncRumStatus(state);
  syncRumScenarioCards(state);
  syncSeedStatus(state);
}

function setSeedStatus(text, isError) {
  const el = document.getElementById('seed-status');
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? '#b91c1c' : '#334155';
}

function setSeedControlsDisabled(disabled) {
  seedInProgress = disabled;
  const section = document.getElementById('board-prep-section');
  if (section) section.classList.toggle('seed-in-progress', disabled);
  const seedBtn = document.getElementById('seed-board');
  const prepareBtn = document.getElementById('prepare-s2');
  if (seedBtn) seedBtn.disabled = disabled;
  if (prepareBtn) prepareBtn.disabled = disabled;
}

function syncSeedStatus(state) {
  if (seedInProgress) return;
  const effective = state.effectiveTargetUrl || state.targetUrl;
  const hint = effective ? ` (target: ${effective})` : '';
  setSeedStatus(`Seed: idle${hint}`);
}

async function runSeedBoard() {
  if (seedInProgress) return;
  setSeedControlsDisabled(true);
  setSeedStatus('Seed: seeding… (this may take up to ~90s)');

  try {
    const result = await api('/api/control/seed-board', { method: 'POST', body: '{}' });
    if (result.skipped) {
      setSeedStatus(
        `Seed: skipped — "${result.boardName}" already has ${result.finalCount} shapes${result.effectiveBaseUrl ? ` (${result.effectiveBaseUrl})` : ''}`
      );
    } else {
      setSeedStatus(
        `Seed: done — ${result.finalCount} shapes on "${result.boardName}" in ${Math.round(result.durationMs / 1000)}s`
      );
    }
    await refresh();
  } catch (e) {
    setSeedStatus(`Seed: failed — ${formatApiError(e, 'seed-board failed')}`, true);
    await refresh();
  } finally {
    setSeedControlsDisabled(false);
  }
}

async function prepareS2() {
  if (seedInProgress) return;

  const state = await api('/api/control/state');
  if (state.phase === 'running' && !state.paused) {
    const ok = window.confirm('Load is running. Pause before seeding?');
    if (!ok) return;
  }

  setSeedControlsDisabled(true);
  setSeedStatus('Prepare S2: pausing…');

  try {
    try {
      await api('/api/control/pause', { method: 'POST' });
    } catch {
      /* already paused or idle */
    }

    setSeedStatus('Prepare S2: seeding loadgen-large (1300)…');
    const result = await api('/api/control/seed-board', { method: 'POST', body: '{}' });

    setSeedStatus('Prepare S2: applying large_board scenario…');
    await api('/api/control/scenario/large_board', { method: 'POST' });

    const shapeLine = result.skipped
      ? `already ${result.finalCount} shapes`
      : `${result.finalCount} shapes seeded`;
    setSeedStatus(`Prepare S2: ready — ${shapeLine}. Click Resume when ready.`);
    await refresh();
  } catch (e) {
    setSeedStatus(`Prepare S2: failed — ${formatApiError(e, 'prepare S2 failed')}`, true);
    await refresh();
  } finally {
    setSeedControlsDisabled(false);
  }
}

function syncRumStatus(state) {
  const el = document.getElementById('rum-status');
  if (!el) return;
  const rum = state.rumBatch;
  if (!rum?.enabled) {
    el.textContent = 'RUM batch: off';
    return;
  }
  if (rum.preset) {
    el.textContent = `RUM batch: preset ${rum.preset}`;
    return;
  }
  const scenarios = (rum.matrix || []).map(r => `${r.scenario} (${r.plan}, v=${r.v})`).join('; ');
  el.textContent = scenarios ? `RUM batch: ${scenarios}` : 'RUM batch: on';
}

function syncRumScenarioCards(state) {
  const root = document.getElementById('rum-scenario-buttons');
  if (!root) return;
  const cards = root.querySelectorAll('.rum-scenario-card');
  cards.forEach(card => card.classList.remove('active'));

  const rum = state.rumBatch;
  if (!rum?.enabled || rum.preset) return;

  const matrix = rum.matrix || [];
  if (matrix.length !== 1) return;

  const activeId = matrix[0].scenario;
  const active = root.querySelector(`[data-rum-scenario="${activeId}"]`);
  if (active) active.classList.add('active');
}

async function loadRumCatalog() {
  if (rumCatalogLoaded) return;
  try {
    const catalog = await api('/api/control/rum/scenarios');
    const presetRoot = document.getElementById('rum-batch-presets');
    const scenarioRoot = document.getElementById('rum-scenario-buttons');
    if (!presetRoot || !scenarioRoot) return;

    presetRoot.innerHTML = '';
    (catalog.batchPresets || []).forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = p.title;
      btn.title = `${p.description} (suggests ${p.suggestedUsers} users)`;
      btn.dataset.rumBatch = p.id;
      btn.onclick = async () => {
        try {
          await api(`/api/control/rum/batch/${p.id}`, { method: 'POST' });
          await refresh();
        } catch (e) {
          alert(formatApiError(e, 'RUM batch preset failed'));
        }
      };
      presetRoot.appendChild(btn);
    });

    scenarioRoot.innerHTML = '';
    (catalog.scenarios || []).forEach(s => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rum-scenario-card';
      btn.dataset.uc = s.useCase;
      btn.dataset.rumScenario = s.id;
      btn.innerHTML = `
        <span class="rum-scenario-card__header">
          <span class="rum-scenario-card__id">${s.id}</span>
          <span class="rum-scenario-card__uc">${s.useCase}</span>
        </span>
        <span class="rum-scenario-card__title">${s.title}</span>
        <span class="rum-scenario-card__desc">${s.description}</span>`;
      btn.onclick = async () => {
        try {
          await api(`/api/control/rum/scenario/${s.id}`, {
            method: 'POST',
            body: JSON.stringify({
              plan: s.defaultPlan,
              version: s.defaultVersion
            })
          });
          await refresh();
        } catch (e) {
          alert(formatApiError(e, 'RUM scenario failed'));
        }
      };
      scenarioRoot.appendChild(btn);
    });

    rumCatalogLoaded = true;
  } catch (e) {
    console.warn('RUM catalog load failed', e);
  }
}

function wireControls() {
  const targetInput = document.getElementById('target-url');
  targetInput.addEventListener('input', () => setDirty('target', true));
  targetInput.addEventListener('focus', () => setDirty('target', true));

  ['users', 'think-time', 'chaos'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => setDirty('users', true));
    el.addEventListener('change', () => setDirty('users', true));
  });

  const pacingEnabled = document.getElementById('session-pacing-enabled');
  pacingEnabled.addEventListener('change', () => {
    if (pacingEnabled.checked) {
      document.getElementById('session-pacing-long-pct').value =
        SESSION_PACING_WORKSHOP.long_fraction_pct;
      document.getElementById('session-pacing-normal-min').value =
        SESSION_PACING_WORKSHOP.normal_min;
      document.getElementById('session-pacing-long-min').value = SESSION_PACING_WORKSHOP.long_min;
      document.getElementById('session-pacing-think-mult').value =
        SESSION_PACING_WORKSHOP.long_think_multiplier;
    }
    setDirty('sessionPacing', true);
  });

  [
    'session-pacing-long-pct',
    'session-pacing-normal-min',
    'session-pacing-long-min',
    'session-pacing-think-mult'
  ].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => setDirty('sessionPacing', true));
    el.addEventListener('change', () => setDirty('sessionPacing', true));
  });

  document.getElementById('apply-session-pacing').onclick = async () => {
    const session_pacing = readSessionPacingFromDom();

    if (session_pacing.enabled) {
      if (session_pacing.long_profile_max_duration_ms < session_pacing.normal_profile_max_duration_ms) {
        alert('Long slice max must be >= normal slice max');
        return;
      }
      if (session_pacing.long_think_multiplier < 1) {
        alert('Think multiplier must be at least 1');
        return;
      }
    }

    try {
      await putConfig({ users: { session_pacing } });
      setDirty('sessionPacing', false);
      await refresh();
    } catch (e) {
      alert(
        (e.errors && e.errors.join('\n')) ||
          e.error ||
          'Failed to apply session pacing'
      );
    }
  };

  document.getElementById('apply-target').onclick = async () => {
    const url = targetInput.value.trim().replace(/\/$/, '');
    if (!url) {
      alert('Target URL is required');
      return;
    }
    try {
      await api('/api/control/reload-target', {
        method: 'POST',
        body: JSON.stringify({ frontend_base_url: url })
      });
      setDirty('target', false);
      await refresh();
    } catch (e) {
      alert(e.error || 'Failed to apply target');
    }
  };

  document.getElementById('apply-users').onclick = async () => {
    const count = parseInt(document.getElementById('users').value, 10);
    const think_time_ms = parseInt(document.getElementById('think-time').value, 10);
    const chaos = document.getElementById('chaos').checked;

    if (!Number.isFinite(count) || count < 1) {
      alert('Virtual users must be at least 1');
      return;
    }

    try {
      const result = await putConfig({
        users: { count, max_contexts_per_pod: count, think_time_ms },
        chaos: { enabled: chaos }
      });
      const applied = result.effective?.users;
      if (applied) {
        document.getElementById('users').value = applied.count;
      }
      setDirty('users', false);
      await refresh();
    } catch (e) {
      alert(
        (e.errors && e.errors.join('\n')) ||
          e.error ||
          'Failed to apply user settings'
      );
    }
  };

  document.getElementById('apply-mix').onclick = async () => {
    const { weights, total } = readMixWeights();
    if (total <= 0) {
      alert('Set at least one profile weight above 0');
      return;
    }
    const mix = normalizeMix(weights);
    try {
      await putConfig({ profiles: { mix } });
      displayMixPercents(mix);
      setDirty('mix', false);
      await refresh();
    } catch (e) {
      alert((e.errors && e.errors.join('\n')) || e.error || 'Failed to apply profile mix');
    }
  };

  document.getElementById('pause').onclick = () =>
    api('/api/control/pause', { method: 'POST' }).then(refresh);

  const resumeBtn = document.getElementById('resume');
  resumeBtn.onclick = async () => {
    resumeBtn.disabled = true;
    try {
      await api('/api/control/resume', { method: 'POST' });
      await refresh();
    } catch (e) {
      alert(e.error || 'Resume failed — check target URL and canvas-frontend');
      await refresh();
    } finally {
      resumeBtn.disabled = false;
    }
  };

  document.querySelectorAll('[data-scenario]').forEach(btn => {
    btn.onclick = async () => {
      try {
        await api(`/api/control/scenario/${btn.dataset.scenario}`, { method: 'POST' });
        setDirty('users', false);
        setDirty('mix', false);
        setDirty('target', false);
        setDirty('sessionPacing', false);
        await refresh();
      } catch (e) {
        alert(e.error || 'Scenario failed');
      }
    };
  });

  const rumDisable = document.getElementById('rum-disable');
  if (rumDisable) {
    rumDisable.onclick = async () => {
      try {
        await api('/api/control/rum/disable', { method: 'POST' });
        await refresh();
      } catch (e) {
        alert(e.error || 'Failed to disable RUM demo');
      }
    };
  }

  const seedBtn = document.getElementById('seed-board');
  if (seedBtn) {
    seedBtn.onclick = () => runSeedBoard();
  }

  const prepareS2Btn = document.getElementById('prepare-s2');
  if (prepareS2Btn) {
    prepareS2Btn.onclick = () => prepareS2();
  }
}

wireControls();
buildMixDom();
loadRumCatalog();
refresh();
setInterval(refresh, 2000);

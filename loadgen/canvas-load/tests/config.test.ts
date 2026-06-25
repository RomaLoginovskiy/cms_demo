import { loadConfig } from '../src/config/loadConfig';
import { validateConfig } from '../src/config/validate';
import { defaultConfig } from '../src/config/defaults';
import { applyScenarioSafe } from '../src/config/scenarios';

describe('config', () => {
  it('validates default config', () => {
    const errors = validateConfig(defaultConfig);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid mix sum', () => {
    const cfg = JSON.parse(JSON.stringify(defaultConfig));
    cfg.profiles.mix = { lurker: 0.5, active_drawer: 0.5, collaborator: 0.5, admin: 0, media_placer: 0 };
    expect(validateConfig(cfg).length).toBeGreaterThan(0);
  });

  it('applies smoke scenario', () => {
    const cfg = JSON.parse(JSON.stringify(defaultConfig));
    applyScenarioSafe(cfg, 'smoke');
    expect(cfg.users.count).toBe(5);
    expect(cfg.run.scenario).toBe('smoke');
  });

  it('SEED-04: large_board scenario targets loadgen-large shared board', () => {
    const cfg = JSON.parse(JSON.stringify(defaultConfig));
    applyScenarioSafe(cfg, 'large_board');
    expect(cfg.run.scenario).toBe('large_board');
    expect(cfg.boards.shared_board_name).toBe('loadgen-large');
    expect(cfg.profiles.mix.text_editor).toBe(0.9);
  });

  it('loads without config file using defaults', async () => {
    const cfg = await loadConfig({});
    expect(cfg.target.frontend_base_url).toMatch(/^http:\/\//);
    expect(cfg.run.run_id).toBeTruthy();
  });

  it('replaces profiles.mix from file without merging omitted default keys', async () => {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-load-'));
    const file = path.join(dir, 'load.yaml');
    fs.writeFileSync(
      file,
      `profiles:
  mix:
    lurker: 0.30
    active_drawer: 0.25
    collaborator: 0.30
    admin: 0.10
    media_placer: 0.05
`
    );
    const cfg = await loadConfig({ configPath: file });
    expect(cfg.profiles.mix).toEqual({
      lurker: 0.3,
      active_drawer: 0.25,
      collaborator: 0.3,
      admin: 0.1,
      media_placer: 0.05
    });
    expect(validateConfig(cfg)).toHaveLength(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

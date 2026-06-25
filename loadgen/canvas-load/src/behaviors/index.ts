import { ProfileName } from '../config/types';
import { runActiveDrawer } from './activeDrawer';
import { runAdmin } from './admin';
import { runChaos } from './chaos';
import { runCollaborator } from './collaborator';
import { runLurker } from './lurker';
import { runMediaPlacer } from './mediaPlacer';
import { runComplexPlacer } from './complexPlacer';
import { runTextEditor } from './textEditor';
import { BehaviorContext, BehaviorFn } from './types';

const runners: Record<ProfileName, BehaviorFn> = {
  lurker: runLurker,
  active_drawer: runActiveDrawer,
  collaborator: runCollaborator,
  admin: runAdmin,
  media_placer: runMediaPlacer,
  complex_placer: runComplexPlacer,
  text_editor: runTextEditor,
  chaos: runChaos
};

export async function runProfile(profile: ProfileName, ctx: BehaviorContext): Promise<void> {
  const fn = runners[profile];
  await fn(ctx);
}

export { pickProfile } from './profilePicker';

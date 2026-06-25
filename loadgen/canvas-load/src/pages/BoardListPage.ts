import { Page } from 'playwright';
import { ActionRecorder } from '../engine/ActionRecorder';
import { appendRumQuery } from '../rum/buildRumQuery';

export class BoardListPage {
  constructor(
    private readonly page: Page,
    private readonly baseUrl: string,
    private readonly recorder: ActionRecorder,
    private readonly profile = 'admin'
  ) {}

  async goto(rumQuery?: string): Promise<void> {
    await this.recorder.record(this.profile, 'gotoList', async () => {
      const url = appendRumQuery(`${this.baseUrl}/`, rumQuery ?? '');
      await this.page.goto(url);
      await this.page.getByRole('heading', { name: 'Whiteboard Boards' }).waitFor({
        timeout: 30000
      });
    });
  }

  async createBoard(name: string): Promise<void> {
    await this.recorder.record(this.profile, 'createBoard', async () => {
      const input = this.page.getByTestId('board-name-input').or(this.page.locator('#board-name'));
      await input.fill(name);
      await this.page.getByRole('button', { name: 'Create' }).click();
      await this.page.waitForURL(/\/boards\//, { timeout: 30000 }).catch(() => undefined);
    });
  }

  async openBoard(name: string): Promise<void> {
    await this.recorder.record(this.profile, 'openBoard', async () => {
      const card = this.page.getByTestId('board-card').filter({ hasText: name });
      await card.locator('.board-open').click();
      await this.page.waitForURL(/\/boards\//, { timeout: 30000 });
    });
  }

  async openBoardById(id: string, rumQuery?: string): Promise<void> {
    await this.recorder.record(this.profile, 'openBoardById', async () => {
      const url = appendRumQuery(`${this.baseUrl}/boards/${id}`, rumQuery ?? '');
      await this.page.goto(url);
      await this.page.getByTestId('whiteboard-canvas').waitFor({ timeout: 30000 });
    });
  }

  async renameFirstLoadgenBoard(newName: string, prefix: string): Promise<void> {
    await this.recorder.record(this.profile, 'renameBoard', async () => {
      const card = this.page.getByTestId('board-card').filter({ hasText: prefix }).first();
      if ((await card.count()) === 0) return;
      const dialogPromise = this.page.waitForEvent('dialog');
      await card.getByRole('button', { name: 'Rename' }).click();
      const dialog = await dialogPromise;
      await dialog.accept(newName);
    });
  }

  async deleteBoardsMatching(prefix: string): Promise<number> {
    let deleted = 0;
    await this.goto();
    for (;;) {
      const card = this.page.getByTestId('board-card').filter({ hasText: prefix }).first();
      if ((await card.count()) === 0) break;
      await this.recorder.record(this.profile, 'deleteBoard', async () => {
        const dialogPromise = this.page.waitForEvent('dialog');
        await card.getByRole('button', { name: 'Delete' }).click();
        const dialog = await dialogPromise;
        await dialog.accept();
        deleted++;
      });
      await this.page.waitForTimeout(300);
    }
    return deleted;
  }
}

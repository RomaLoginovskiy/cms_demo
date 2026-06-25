import { Page } from 'playwright';
import { ActionRecorder } from '../engine/ActionRecorder';
import { Box, drawOnCanvas, moveMouseOnCanvas } from './helpers/canvas';

export class WhiteboardPage {
  constructor(
    private readonly page: Page,
    private readonly recorder: ActionRecorder,
    private readonly profile: string
  ) {}

  async goto(url: string): Promise<void> {
    await this.recorder.record(this.profile, 'gotoBoard', async () => {
      await this.page.goto(url);
    });
  }

  async waitReady(): Promise<void> {
    await this.recorder.record(this.profile, 'waitReady', async () => {
      await this.page.getByTestId('whiteboard-canvas').waitFor({ timeout: 30000 });
      await this.page
        .getByTestId('connection-status')
        .filter({ hasText: 'connected' })
        .waitFor({ timeout: 15000 })
        .catch(() => undefined);
    });
  }

  async getShapeCount(): Promise<number> {
    const text = await this.page.getByTestId('shape-count').textContent();
    const m = text?.match(/(\d+)/);
    return m ? parseInt(m[1]!, 10) : 0;
  }

  async selectTool(tool: string): Promise<void> {
    await this.recorder.record(this.profile, 'selectTool', async () => {
      await this.page.getByRole('button', { name: tool, exact: true }).click();
    });
  }

  async drawShape(tool: string, box: Box): Promise<void> {
    await this.recorder.record(this.profile, 'drawShape', async () => {
      await drawOnCanvas(this.page, tool, box);
    });
  }

  async moveMouse(x: number, y: number): Promise<void> {
    await this.recorder.record(this.profile, 'moveMouse', async () => {
      await moveMouseOnCanvas(this.page, x, y);
    });
  }

  async selectShapeAt(x: number, y: number): Promise<void> {
    await this.recorder.record(this.profile, 'selectShapeAt', async () => {
      await this.page.getByRole('button', { name: 'Select', exact: true }).click();
      const canvas = this.page.getByTestId('whiteboard-canvas');
      await canvas.click({ position: { x, y } });
    });
  }

  async deleteSelection(): Promise<void> {
    await this.recorder.record(this.profile, 'deleteSelection', async () => {
      await this.page.keyboard.press('Backspace');
    });
  }

  async editStickyText(x: number, y: number, text: string): Promise<void> {
    await this.recorder.record(this.profile, 'editStickyText', async () => {
      const canvas = this.page.getByTestId('whiteboard-canvas');
      await canvas.dblclick({ position: { x, y } });
      const editor = this.page.getByTestId('whiteboard-text-editor');
      await editor.waitFor({ timeout: 10000 });
      await editor.fill(text);
      await editor.blur();
      await editor.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
    });
  }

  async editSelectedColor(): Promise<void> {
    await this.recorder.record(this.profile, 'editSelectedColor', async () => {
      const fill = this.page.getByLabel('Fill');
      if ((await fill.count()) === 0) return;
      await fill.fill('#ff00aa');
    });
  }

  async placeComplexTemplate(tab: 'path' | 'mesh3d', templateName: string): Promise<void> {
    await this.recorder.record(this.profile, 'placeComplexTemplate', async () => {
      await this.page.getByRole('button', { name: 'Complex shapes' }).click();
      if (tab === 'mesh3d') {
        await this.page.getByRole('button', { name: '3D meshes' }).click();
      }
      await this.page.getByRole('button', { name: templateName, exact: true }).click();
    });
  }

  async openPicturesAndPlaceFirst(query: string): Promise<boolean> {
    return this.recorder.record(this.profile, 'placePicture', async () => {
      await this.page.getByRole('button', { name: 'Pictures' }).click();
      const error = this.page.getByRole('alert');
      await this.page.waitForTimeout(500);
      if (await error.isVisible().catch(() => false)) {
        return false;
      }
      if (query) {
        await this.page.locator('#picture-search').fill(query);
        await this.page.getByRole('button', { name: 'Search' }).click();
        await this.page.waitForTimeout(500);
      }
      const result = this.page.locator('.media-result').first();
      if ((await result.count()) === 0) return false;
      await result.click();
      return true;
    });
  }

  async goBack(): Promise<void> {
    await this.recorder.record(this.profile, 'goBack', async () => {
      await this.page.getByRole('button', { name: 'Back' }).click();
      await this.page.getByRole('heading', { name: 'Whiteboard Boards' }).waitFor({
        timeout: 15000
      });
    });
  }
}

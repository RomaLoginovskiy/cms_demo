import { Page, Response } from 'playwright';
import { ActionRecorder } from '../engine/ActionRecorder';
import { appendRumQuery } from '../rum/buildRumQuery';

export type CmsNavTarget = 'gallery' | 'upload' | 'stats' | 'about';

export interface CmsUploadFile {
  name: string;
  buffer: Buffer;
}

/** Selector for a CMS control by its Coralogix action name (`data-cx-action-name`). */
export function cxAction(name: string): string {
  return `[data-cx-action-name="${name}"]`;
}

function isMediaApiCall(response: Response, method: string, id?: string): boolean {
  if (response.request().method() !== method) return false;
  const path = new URL(response.url()).pathname;
  return id ? path.endsWith(`/api/media/${id}`) : path.endsWith('/api/media');
}

/**
 * Page object for the CMS frontend. Every step is a real click on a control with a
 * `data-cx-action-name`, so Coralogix RUM records it as a named action (funnel step).
 */
export class CmsPage {
  constructor(
    private readonly page: Page,
    private readonly recorder: ActionRecorder,
    private readonly profile: string,
    private readonly baseUrl: string,
    private readonly rumQuery: string
  ) {}

  /** Lands on the gallery: in-app nav when already on CMS, otherwise a full load carrying `rum_user`. */
  async openGallery(): Promise<void> {
    await this.closeModalIfOpen();
    if (this.page.url().startsWith(this.baseUrl)) {
      await this.clickNav('gallery');
      return;
    }

    await this.recorder.record(this.profile, 'gotoCms', async () => {
      await this.page.goto(appendRumQuery(`${this.baseUrl}/`, this.rumQuery));
      await this.waitForGallery();
    });
  }

  async clickNav(target: CmsNavTarget): Promise<void> {
    await this.recorder.record(this.profile, `nav_${target}`, async () => {
      await this.page.locator(cxAction(`nav-${target}`)).click();
      if (target === 'gallery') {
        await this.waitForGallery();
      } else if (target === 'upload') {
        await this.page.locator(cxAction('upload-select-file')).waitFor({ state: 'attached' });
      }
    });
  }

  /** Clicks the file picker (recorded as a RUM action) and answers the chooser. */
  async selectFile(file: CmsUploadFile): Promise<void> {
    await this.recorder.record(this.profile, 'selectFile', async () => {
      const [chooser] = await Promise.all([
        this.page.waitForEvent('filechooser'),
        this.page.locator(cxAction('upload-select-file')).click()
      ]);
      await chooser.setFiles({ name: file.name, mimeType: 'image/png', buffer: file.buffer });
      await this.page.locator(cxAction('upload-edit-title')).last().waitFor();
    });
  }

  async fillUploadDetails(title: string, description: string): Promise<void> {
    await this.recorder.record(this.profile, 'fillDetails', async () => {
      const titleInput = this.page.locator(cxAction('upload-edit-title')).last();
      await titleInput.click();
      await titleInput.fill(title);
      const descriptionInput = this.page.locator(cxAction('upload-edit-description')).last();
      await descriptionInput.click();
      await descriptionInput.fill(description);
    });
  }

  async addUploadTag(tag: string): Promise<void> {
    await this.recorder.record(this.profile, 'addTag', async () => {
      const input = this.page.locator(cxAction('upload-add-tag')).last();
      await input.click();
      await input.fill(tag);
      await input.press('Enter');
    });
  }

  /** Submits the queue and returns the id of the created media item. */
  async submitUpload(): Promise<string> {
    return this.recorder.record(this.profile, 'uploadSubmit', async () => {
      const responsePromise = this.page.waitForResponse(r => isMediaApiCall(r, 'POST'));
      await this.page.locator(cxAction('upload-submit-all')).click();
      const response = await responsePromise;
      if (!response.ok()) {
        throw new Error(`upload failed: HTTP ${response.status()}`);
      }
      const body = (await response.json()) as { id?: string };
      if (!body.id) {
        throw new Error('upload response has no id');
      }
      return body.id;
    });
  }

  /** Clicks a tag filter pill. Returns false when the tag has no pill (nothing tagged with it yet). */
  async filterByTag(tag: string): Promise<boolean> {
    const pill = this.page.locator(`${cxAction('gallery-filter-tag')}[data-tag="${tag}"]`);
    // Pills come from a separate /api/media/tags fetch that can land after the gallery renders.
    const present = await pill
      .first()
      .waitFor({ timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (!present) return false;
    await this.recorder.record(this.profile, 'filterTag', async () => {
      await pill.first().click();
    });
    return true;
  }

  async clearFilters(): Promise<void> {
    const button = this.page.locator(cxAction('gallery-clear-filters')).first();
    if (!(await button.isVisible())) return;
    await this.recorder.record(this.profile, 'clearFilters', async () => {
      await button.click();
    });
  }

  async openMedia(id: string): Promise<void> {
    await this.recorder.record(this.profile, 'openMedia', async () => {
      await this.page.locator(`[data-media-id="${id}"]`).click();
      await this.page.locator(cxAction('media-edit')).waitFor();
    });
  }

  /** Opens a random tile in the gallery. Returns false when the gallery is empty. */
  async openRandomMedia(rng: () => number): Promise<boolean> {
    const tiles = this.page.locator(cxAction('media-open'));
    const count = await tiles.count();
    if (count === 0) return false;
    await this.recorder.record(this.profile, 'openMedia', async () => {
      await tiles.nth(Math.floor(rng() * count)).click();
      await this.page.locator(cxAction('media-edit')).waitFor();
    });
    return true;
  }

  async editAndSave(id: string, title: string, description: string): Promise<void> {
    await this.recorder.record(this.profile, 'editSave', async () => {
      await this.page.locator(cxAction('media-edit')).click();
      const titleInput = this.page.locator(cxAction('media-edit-title'));
      await titleInput.click();
      await titleInput.fill(title);
      const descriptionInput = this.page.locator(cxAction('media-edit-description'));
      await descriptionInput.click();
      await descriptionInput.fill(description);

      const responsePromise = this.page.waitForResponse(r => isMediaApiCall(r, 'PUT', id));
      await this.page.locator(cxAction('media-save')).click();
      const response = await responsePromise;
      if (!response.ok()) {
        throw new Error(`update failed: HTTP ${response.status()}`);
      }
      await this.page.locator(cxAction('media-edit')).waitFor();
    });
  }

  /** Deletes the media open in the modal, accepting the confirm dialog. */
  async deleteOpenMedia(id: string): Promise<void> {
    await this.recorder.record(this.profile, 'deleteMedia', async () => {
      this.page.once('dialog', dialog => {
        void dialog.accept().catch(() => undefined);
      });
      const responsePromise = this.page.waitForResponse(r => isMediaApiCall(r, 'DELETE', id));
      await this.page.locator(cxAction('media-delete')).click();
      const response = await responsePromise;
      if (!response.ok()) {
        throw new Error(`delete failed: HTTP ${response.status()}`);
      }
      await this.page.locator(cxAction('media-delete')).waitFor({ state: 'detached' });
    });
  }

  async closeModal(): Promise<void> {
    await this.recorder.record(this.profile, 'closeModal', async () => {
      await this.page.locator(cxAction('media-close')).click();
      await this.page.locator(cxAction('media-close')).waitFor({ state: 'detached' });
    });
  }

  private async waitForGallery(): Promise<void> {
    await this.page
      .locator('h2:has-text("Media Gallery"), :text("No media uploaded yet")')
      .first()
      .waitFor();
  }

  /** A modal left open by a failed step covers the nav; close it without recording an action. */
  private async closeModalIfOpen(): Promise<void> {
    const close = this.page.locator(cxAction('media-close'));
    if (await close.isVisible().catch(() => false)) {
      await close.click({ timeout: 2000 }).catch(() => undefined);
    }
  }
}

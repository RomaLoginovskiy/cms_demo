import {
  addOwnedMedia,
  ownedMedia,
  removeOwnedMedia,
  resetOwnedMedia
} from '../../src/cms/ownedMedia';

describe('ownedMedia', () => {
  beforeEach(() => resetOwnedMedia());

  it('tracks ids per user, oldest first', () => {
    addOwnedMedia(1, 'a');
    addOwnedMedia(1, 'b');
    addOwnedMedia(2, 'c');
    removeOwnedMedia(1, 'a');

    expect(ownedMedia(1)).toEqual(['b']);
    expect(ownedMedia(2)).toEqual(['c']);
    expect(ownedMedia(3)).toEqual([]);
  });
});

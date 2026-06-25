import { FormEvent, useState } from 'react';
import { cmsMediaApi } from '../media/cmsMediaApi';
import { CmsMedia } from '../types/models';

interface MediaPickerProps {
  onPlaceImage: (media: CmsMedia) => void;
}

export function MediaPicker({ onPlaceImage }: MediaPickerProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [images, setImages] = useState<CmsMedia[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    setOpen(true);
    setError(null);

    try {
      setImages(await cmsMediaApi.listImages(query));
    } catch {
      setError('Unable to load CMS pictures.');
    }
  }

  return (
    <section className="media-picker">
      <button type="button" onClick={() => void search()}>Pictures</button>
      {open && (
        <div className="media-popover">
          <form onSubmit={(event) => void search(event)}>
            <label htmlFor="picture-search">Search CMS pictures</label>
            <div className="row">
              <input id="picture-search" value={query} onChange={(event) => setQuery(event.target.value)} />
              <button type="submit">Search</button>
            </div>
          </form>
          {error && <p role="alert" className="error">{error}</p>}
          <div className="media-results">
            {images.map(image => (
              <button key={image.id} type="button" className="media-result" onClick={() => onPlaceImage(image)}>
                <img src={cmsMediaApi.fileUrl(image.id)} alt={image.title || image.fileName} />
                <span>{image.title || image.fileName}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

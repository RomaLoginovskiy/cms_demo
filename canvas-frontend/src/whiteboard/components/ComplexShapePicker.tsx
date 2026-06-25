import { useState } from 'react';
import { pathTemplateCatalog, mesh3DTemplateCatalog } from '../templates/catalog';
import { ShapeTemplate } from '../templates/types';

interface ComplexShapePickerProps {
  onPlaceTemplate: (template: ShapeTemplate) => void;
}

export function ComplexShapePicker({ onPlaceTemplate }: ComplexShapePickerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'path' | 'mesh3d'>('path');

  return (
    <section className="complex-picker">
      <button type="button" onClick={() => setOpen(value => !value)}>Complex shapes</button>
      {open && (
        <div className="complex-popover">
          <div className="complex-tabs" role="tablist">
            <button type="button" className={tab === 'path' ? 'active' : ''} onClick={() => setTab('path')}>2D paths</button>
            <button type="button" className={tab === 'mesh3d' ? 'active' : ''} onClick={() => setTab('mesh3d')}>3D meshes</button>
          </div>
          <div className="complex-results">
            {(tab === 'path' ? pathTemplateCatalog : mesh3DTemplateCatalog).map(template => (
              <button
                key={template.id}
                type="button"
                className="complex-result"
                aria-label={template.name}
                onClick={() => {
                  onPlaceTemplate(template);
                  setOpen(false);
                }}
              >
                <span className="complex-thumb">{template.kind === 'path' ? '2D' : '3D'}</span>
                <span>{template.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

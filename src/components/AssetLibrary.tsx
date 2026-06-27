import React, { useRef } from 'react';
import type { Asset } from '../types';
import { Film, Music, Image as ImageIcon, Plus, Trash2, Upload } from 'lucide-react';
import { formatDuration } from '../utils/time';

interface AssetLibraryProps {
  assets: Asset[];
  onAddAsset: (file: File) => void;
  onRemoveAsset: (id: string) => void;
  onAddToTimeline: (asset: Asset) => void;
}

export const AssetLibrary: React.FC<AssetLibraryProps> = ({
  assets,
  onAddAsset,
  onRemoveAsset,
  onAddToTimeline,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach((file) => {
        onAddAsset(file);
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      Array.from(e.dataTransfer.files).forEach((file) => {
        onAddAsset(file);
      });
    }
  };

  const handleDragStart = (e: React.DragEvent, asset: Asset) => {
    e.dataTransfer.setData('text/plain', asset.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const getAssetIcon = (type: Asset['type']) => {
    switch (type) {
      case 'video':
        return <Film size={18} className="logo-icon" />;
      case 'audio':
        return <Music size={18} style={{ color: 'var(--color-success)' }} />;
      case 'image':
        return <ImageIcon size={18} style={{ color: 'var(--color-warning)' }} />;
    }
  };

  return (
    <div className="panel-content">
      <div
        className="import-zone"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <Upload size={32} />
        <div>
          <p style={{ fontWeight: 600, color: 'var(--text-main)' }}>Import Media</p>
          <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>
            Drag & drop video/audio files or click to browse
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,audio/*,image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      <div style={{ marginTop: '8px' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>
          Project Assets ({assets.length})
        </h3>
        
        {assets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            No assets imported yet. Upload files to get started.
          </div>
        ) : (
          <div className="asset-list">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="asset-item"
                draggable
                onDragStart={(e) => handleDragStart(e, asset)}
              >
                <div className="asset-thumbnail">
                  {asset.type === 'video' ? (
                    <video src={asset.url} muted preload="metadata" />
                  ) : asset.type === 'image' ? (
                    <img src={asset.url} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Music size={20} style={{ color: 'var(--color-success)' }} />
                  )}
                </div>

                <div className="asset-info">
                  <div className="asset-name" title={asset.name}>
                    {asset.name}
                  </div>
                  <div className="asset-meta">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '8px' }}>
                      {getAssetIcon(asset.type)}
                      {asset.type}
                    </span>
                    <span>{formatDuration(asset.duration)}</span>
                  </div>
                </div>

                <div className="asset-actions">
                  <button
                    className="btn btn-icon"
                    style={{ width: '28px', height: '28px', padding: 0 }}
                    onClick={() => onAddToTimeline(asset)}
                    title="Add to Timeline"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    className="btn btn-icon"
                    style={{ width: '28px', height: '28px', padding: 0, color: 'var(--color-accent)' }}
                    onClick={() => onRemoveAsset(asset.id)}
                    title="Delete Asset"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

import React from 'react';
import type { Clip, Track } from '../types';
import { Trash2, Volume2, Gauge, Type, Clock, Move, RotateCw } from 'lucide-react';

interface ClipControlsProps {
  selectedClipId: string | null;
  tracks: Track[];
  onUpdateClip: (clipId: string, updates: Partial<Clip>) => void;
  onDeleteClip: (clipId: string) => void;
}

export const ClipControls: React.FC<ClipControlsProps> = ({
  selectedClipId,
  tracks,
  onUpdateClip,
  onDeleteClip,
}) => {
  // Find the selected clip and its parent track
  let selectedClip: Clip | null = null;
  let parentTrack: Track | null = null;

  if (selectedClipId) {
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) {
        selectedClip = clip;
        parentTrack = track;
        break;
      }
    }
  }

  if (!selectedClip || !parentTrack) {
    return (
      <div className="panel-content" style={{ justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
        <p style={{ textAlign: 'center', fontSize: '0.85rem' }}>
          Select a clip on the timeline to inspect and edit its properties.
        </p>
      </div>
    );
  }

  const duration = selectedClip.timeEnd - selectedClip.timeStart;
  const isTextClip = selectedClip.text !== undefined;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateClip(selectedClip!.id, { name: e.target.value });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateClip(selectedClip!.id, { volume: parseFloat(e.target.value) });
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSpeed = parseFloat(e.target.value);
    const oldSpeed = selectedClip!.speed;
    const speedRatio = oldSpeed / newSpeed;
    
    // Scale duration based on speed change
    const newDuration = duration * speedRatio;
    onUpdateClip(selectedClip!.id, {
      speed: newSpeed,
      timeEnd: selectedClip!.timeStart + newDuration,
    });
  };

  // Text specific handlers
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdateClip(selectedClip!.id, { text: e.target.value });
  };

  const handleTextColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateClip(selectedClip!.id, { textColor: e.target.value });
  };

  const handleFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateClip(selectedClip!.id, { fontSize: parseInt(e.target.value) });
  };

  // Transform handlers
  const handleXChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateClip(selectedClip!.id, { x: parseInt(e.target.value) });
  };

  const handleYChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateClip(selectedClip!.id, { y: parseInt(e.target.value) });
  };

  const handleScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateClip(selectedClip!.id, { scale: parseFloat(e.target.value) });
  };

  const handleRotationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateClip(selectedClip!.id, { rotation: parseInt(e.target.value) });
  };

  const handleFlipH = () => {
    onUpdateClip(selectedClip!.id, { flipH: !selectedClip!.flipH });
  };

  const handleFlipV = () => {
    onUpdateClip(selectedClip!.id, { flipV: !selectedClip!.flipV });
  };

  const handleFitModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdateClip(selectedClip!.id, { fitMode: e.target.value as Clip['fitMode'] });
  };

  // Defaults for transform state values
  const posX = selectedClip.x ?? 0;
  const posY = selectedClip.y ?? 0;
  const scaleVal = selectedClip.scale ?? 1.0;
  const rotateVal = selectedClip.rotation ?? 0;
  const fitModeVal = selectedClip.fitMode ?? 'fit';

  return (
    <div className="panel-content" style={{ gap: '14px' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, borderBottom: '1px solid var(--border-light)', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Clip Inspector</span>
        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: isTextClip ? 'rgba(236, 72, 153, 0.2)' : 'rgba(99, 102, 241, 0.2)', color: isTextClip ? '#f472b6' : 'var(--color-primary)' }}>
          {isTextClip ? 'TEXT LAYER' : parentTrack.type.toUpperCase()}
        </span>
      </h3>

      {/* Name Edit */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Type size={12} />
          Clip Name
        </label>
        <input
          type="text"
          className="input-text"
          value={selectedClip.name}
          onChange={handleNameChange}
        />
      </div>

      {/* Time & Duration Display */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={12} />
            Start Time
          </label>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
            {selectedClip.timeStart.toFixed(2)}s
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={12} />
            Duration
          </label>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
            {duration.toFixed(2)}s
          </div>
        </div>
      </div>

      {/* Text Properties Section */}
      {isTextClip && (
        <div style={{ border: '1px solid rgba(236,72,153,0.15)', background: 'rgba(236,72,153,0.02)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f472b6' }}>Text Properties</span>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Text Content</label>
            <textarea
              className="input-text"
              style={{ minHeight: '60px', resize: 'vertical' }}
              value={selectedClip.text || ''}
              onChange={handleTextChange}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Font Size ({selectedClip.fontSize || 48}px)</label>
              <input
                type="range"
                min="12"
                max="120"
                value={selectedClip.fontSize || 48}
                onChange={handleFontSizeChange}
                style={{ accentColor: '#f472b6' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Color</label>
              <input
                type="color"
                style={{ width: '100%', height: '30px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                value={selectedClip.textColor || '#ffffff'}
                onChange={handleTextColorChange}
              />
            </div>
          </div>
        </div>
      )}

      {/* Audio / Video controls (Volume, Speed) */}
      {!isTextClip && (
        <>
          {/* Volume Control */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Volume2 size={12} />
              Clip Volume ({Math.round(selectedClip.volume * 100)}%)
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={selectedClip.volume}
              onChange={handleVolumeChange}
              style={{ accentColor: 'var(--color-primary)' }}
            />
          </div>

          {/* Speed Control */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Gauge size={12} />
              Playback Speed
            </label>
            <select
              className="input-select"
              value={selectedClip.speed}
              onChange={handleSpeedChange}
            >
              <option value="0.25">0.25x</option>
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1.0">1.0x (Normal)</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2.0">2.0x</option>
            </select>
          </div>
        </>
      )}

      {/* Visual Transform Section (For Video/Image and Text clips) */}
      {(parentTrack.type === 'video' || isTextClip) && (
        <div style={{ border: '1px solid var(--border-medium)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Move size={14} />
            Canvas Transforms
          </span>

          {/* Position X / Y */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Pos X ({posX}px)</label>
              <input
                type="range"
                min="-640"
                max="640"
                value={posX}
                onChange={handleXChange}
                style={{ accentColor: 'var(--color-primary)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Pos Y ({posY}px)</label>
              <input
                type="range"
                min="-360"
                max="360"
                value={posY}
                onChange={handleYChange}
                style={{ accentColor: 'var(--color-primary)' }}
              />
            </div>
          </div>

          {/* Scale & Rotate */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Scale ({scaleVal.toFixed(2)}x)</label>
              <input
                type="range"
                min="0.1"
                max="4.0"
                step="0.05"
                value={scaleVal}
                onChange={handleScaleChange}
                style={{ accentColor: 'var(--color-primary)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <RotateCw size={10} /> Rotate ({rotateVal}°)</label>
              <input
                type="range"
                min="0"
                max="360"
                value={rotateVal}
                onChange={handleRotationChange}
                style={{ accentColor: 'var(--color-primary)' }}
              />
            </div>
          </div>

          {/* Flip Controls & Fit Mode (Only for video/image, not pure text) */}
          {!isTextClip && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className={`btn ${selectedClip.flipH ? 'btn-primary' : ''}`}
                  style={{ flex: 1, padding: '4px 0', fontSize: '0.7rem' }}
                  onClick={handleFlipH}
                  title="Flip Horizontal"
                >
                  Flip H
                </button>
                <button
                  type="button"
                  className={`btn ${selectedClip.flipV ? 'btn-primary' : ''}`}
                  style={{ flex: 1, padding: '4px 0', fontSize: '0.7rem' }}
                  onClick={handleFlipV}
                  title="Flip Vertical"
                >
                  Flip V
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <select
                  className="input-select"
                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                  value={fitModeVal}
                  onChange={handleFitModeChange}
                >
                  <option value="fit">Fit / Contain</option>
                  <option value="fill">Fill / Cover</option>
                  <option value="stretch">Stretch</option>
                  <option value="custom">Custom Scale</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Danger Zone: Delete Clip */}
      <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
        <button
          className="btn btn-accent"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => onDeleteClip(selectedClip!.id)}
        >
          <Trash2 size={16} />
          Remove Clip
        </button>
      </div>
    </div>
  );
};

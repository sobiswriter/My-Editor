import React from 'react';
import type { Clip, Track } from '../types';
import { Trash2, Volume2, Gauge, Type, Clock } from 'lucide-react';

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

  return (
    <div className="panel-content">
      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
        Clip Properties
      </h3>

      {/* Name Edit */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={12} />
            Start Time
          </label>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px', fontSize: '0.85rem', fontFamily: 'monospace' }}>
            {selectedClip.timeStart.toFixed(2)}s
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={12} />
            Duration
          </label>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px', fontSize: '0.85rem', fontFamily: 'monospace' }}>
            {duration.toFixed(2)}s
          </div>
        </div>
      </div>

      {/* Volume Control (Audio / Video clips) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Volume2 size={12} />
          Clip Volume ({Math.round(selectedClip.volume * 100)}%)
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={selectedClip.volume}
            onChange={handleVolumeChange}
            style={{ flex: 1, accentColor: 'var(--color-primary)' }}
          />
        </div>
      </div>

      {/* Speed Multiplier */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Gauge size={12} />
          Playback Speed
        </label>
        <select
          className="input-select"
          value={selectedClip.speed}
          onChange={handleSpeedChange}
        >
          <option value="0.25">0.25x (Slow motion)</option>
          <option value="0.5">0.5x</option>
          <option value="0.75">0.75x</option>
          <option value="1.0">1.0x (Normal)</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="2.0">2.0x (Fast forward)</option>
        </select>
      </div>

      {/* Danger Zone: Delete Clip */}
      <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
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

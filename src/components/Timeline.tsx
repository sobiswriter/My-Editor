import React, { useRef, useState, useEffect } from 'react';
import type { Track, Clip, Asset } from '../types';
import { formatTime } from '../utils/time';
import { ZoomIn, ZoomOut, Magnet, Trash2, Split, Eye, Volume2 } from 'lucide-react';

interface TimelineProps {
  tracks: Track[];
  assets: Asset[];
  playhead: number;
  zoom: number; // Pixels per second
  duration: number; // Project duration in seconds
  selectedClipId: string | null;
  onSeek: (time: number) => void;
  onUpdateZoom: (zoom: number) => void;
  onUpdateClip: (clipId: string, updates: Partial<Clip>) => void;
  onSelectClip: (clipId: string | null) => void;
  onDeleteClip: (clipId: string) => void;
  onSplit: () => void;
  onAddClipToTrack: (assetId: string, trackId: string, timeStart: number) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  tracks,
  assets,
  playhead,
  zoom,
  duration,
  selectedClipId,
  onSeek,
  onUpdateZoom,
  onUpdateClip,
  onSelectClip,
  onDeleteClip,
  onSplit,
  onAddClipToTrack,
}) => {
  const tracksViewportRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [isSnapping, setIsSnapping] = useState<boolean>(true);
  const [activeDrag, setActiveDrag] = useState<{
    type: 'move' | 'trim-left' | 'trim-right';
    clipId: string;
    initialTimeStart: number;
    initialTimeEnd: number;
    initialTrimStart: number;
    initialTrimEnd: number;
    initialMouseX: number;
    clipDuration: number;
    assetDuration: number;
    initialTrackId: string;
  } | null>(null);

  // Drag over states for dropping assets from AssetLibrary
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);

  // Dynamic tick intervals based on zoom
  let tickInterval = 1; // seconds
  let labelInterval = 5; // seconds
  if (zoom >= 120) {
    tickInterval = 0.1;
    labelInterval = 1;
  } else if (zoom >= 60) {
    tickInterval = 0.5;
    labelInterval = 2;
  } else if (zoom >= 30) {
    tickInterval = 1;
    labelInterval = 5;
  } else {
    tickInterval = 2;
    labelInterval = 10;
  }

  const ticks: number[] = [];
  const timelineBuffer = Math.max(duration + 30, 60); // Show at least 60 seconds or duration + 30s buffer
  for (let t = 0; t <= timelineBuffer; t += tickInterval) {
    ticks.push(t);
  }

  // Snapping calculations
  const getSnapPoints = (excludeClipId: string): number[] => {
    if (!isSnapping) return [];
    const points: number[] = [0, playhead];
    tracks.forEach((t) => {
      t.clips.forEach((c) => {
        if (c.id !== excludeClipId) {
          points.push(c.timeStart);
          points.push(c.timeEnd);
        }
      });
    });
    return Array.from(new Set(points));
  };

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const time = Math.max(0, clickX / zoom);
    onSeek(time);
  };

  // Dragging logic for Clips (Move & Trim)
  const handleClipMouseDown = (
    e: React.MouseEvent,
    clip: Clip,
    type: 'move' | 'trim-left' | 'trim-right'
  ) => {
    e.stopPropagation();
    onSelectClip(clip.id);

    const asset = assets.find((a) => a.id === clip.assetId);
    if (!asset) return;

    setActiveDrag({
      type,
      clipId: clip.id,
      initialTimeStart: clip.timeStart,
      initialTimeEnd: clip.timeEnd,
      initialTrimStart: clip.trimStart,
      initialTrimEnd: clip.trimEnd,
      initialMouseX: e.clientX,
      clipDuration: clip.timeEnd - clip.timeStart,
      assetDuration: asset.duration,
      initialTrackId: clip.trackId,
    });
  };

  useEffect(() => {
    if (!activeDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - activeDrag.initialMouseX;
      const deltaTime = deltaX / zoom;

      // Find the clip to apply updates
      let clip: Clip | null = null;
      for (const track of tracks) {
        const found = track.clips.find((c) => c.id === activeDrag.clipId);
        if (found) {
          clip = found;
          break;
        }
      }
      if (!clip) return;

      const snapPoints = getSnapPoints(activeDrag.clipId);
      const snapThreshold = 10 / zoom; // 10 pixels in seconds

      const snapValue = (value: number): number => {
        for (const pt of snapPoints) {
          if (Math.abs(value - pt) < snapThreshold) {
            return pt;
          }
        }
        return value;
      };

      if (activeDrag.type === 'move') {
        let newTimeStart = activeDrag.initialTimeStart + deltaTime;
        newTimeStart = Math.max(0, newTimeStart);
        
        // Snapping start or end
        let snappedTimeStart = snapValue(newTimeStart);
        let snappedTimeEnd = snapValue(newTimeStart + activeDrag.clipDuration);
        
        if (snappedTimeStart !== newTimeStart) {
          newTimeStart = snappedTimeStart;
        } else if (snappedTimeEnd !== newTimeStart + activeDrag.clipDuration) {
          newTimeStart = snappedTimeEnd - activeDrag.clipDuration;
        }

        // Handle Track change via vertical mouse position
        let newTrackId = activeDrag.initialTrackId;
        if (tracksViewportRef.current) {
          const rect = tracksViewportRef.current.getBoundingClientRect();
          const relativeY = e.clientY - rect.top;
          // Track row index calculation
          const trackIndex = Math.floor(relativeY / 80);
          
          // Determine track compatibility (video tracks vs audio tracks)
          const targetTrack = tracks[trackIndex];
          const sourceTrack = tracks.find(t => t.id === activeDrag.initialTrackId);

          if (targetTrack && sourceTrack && targetTrack.type === sourceTrack.type) {
            newTrackId = targetTrack.id;
          }
        }

        onUpdateClip(activeDrag.clipId, {
          timeStart: Math.max(0, newTimeStart),
          timeEnd: Math.max(0, newTimeStart + activeDrag.clipDuration),
          trackId: newTrackId,
        });

      } else if (activeDrag.type === 'trim-left') {
        let newTimeStart = activeDrag.initialTimeStart + deltaTime;
        newTimeStart = Math.max(0, newTimeStart);
        newTimeStart = snapValue(newTimeStart);

        // Constrain trim
        const actualDelta = newTimeStart - activeDrag.initialTimeStart;
        const newTrimStart = activeDrag.initialTrimStart + actualDelta;

        if (newTrimStart >= 0 && newTimeStart < activeDrag.initialTimeEnd - 0.1) {
          onUpdateClip(activeDrag.clipId, {
            timeStart: newTimeStart,
            trimStart: newTrimStart,
          });
        }
      } else if (activeDrag.type === 'trim-right') {
        let newTimeEnd = activeDrag.initialTimeEnd + deltaTime;
        newTimeEnd = snapValue(newTimeEnd);

        // Constrain trim
        const actualDelta = newTimeEnd - activeDrag.initialTimeEnd;
        const durationLimit = activeDrag.assetDuration - activeDrag.initialTrimStart;
        const newClipDuration = activeDrag.clipDuration + actualDelta;

        if (newClipDuration > 0.1 && newClipDuration <= durationLimit) {
          onUpdateClip(activeDrag.clipId, {
            timeEnd: newTimeEnd,
          });
        }
      }
    };

    const handleMouseUp = () => {
      setActiveDrag(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeDrag, zoom, tracks, playhead, isSnapping]);

  // Asset Drag and Drop onto tracks
  const handleTrackDragOver = (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    setDragOverTrackId(trackId);
  };

  const handleTrackDragLeave = () => {
    setDragOverTrackId(null);
  };

  const handleTrackDrop = (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    setDragOverTrackId(null);
    const assetId = e.dataTransfer.getData('text/plain');
    if (!assetId) return;

    // Calculate timeStart based on drop cursor X relative to track row
    const trackRow = e.currentTarget as HTMLDivElement;
    const rect = trackRow.getBoundingClientRect();
    const dropX = e.clientX - rect.left;
    const timeStart = Math.max(0, dropX / zoom);

    onAddClipToTrack(assetId, trackId, timeStart);
  };

  return (
    <div className="timeline-panel">
      {/* Toolbar */}
      <div className="timeline-toolbar">
        <div className="timeline-tools">
          <button
            className={`btn ${isSnapping ? 'btn-primary' : ''}`}
            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            onClick={() => setIsSnapping(!isSnapping)}
            title="Toggle Magnet Snapping"
          >
            <Magnet size={14} />
            Snapping
          </button>
          
          <button
            className="btn"
            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            onClick={onSplit}
            disabled={!selectedClipId}
            title="Split selected clip at playhead"
          >
            <Split size={14} />
            Split
          </button>

          <button
            className="btn"
            style={{ padding: '6px 12px', fontSize: '0.8rem', color: 'var(--color-accent)' }}
            onClick={() => selectedClipId && onDeleteClip(selectedClipId)}
            disabled={!selectedClipId}
            title="Delete selected clip"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>

        {/* Zoom Control */}
        <div className="timeline-zoom">
          <ZoomOut size={14} />
          <input
            type="range"
            min="20"
            max="250"
            value={zoom}
            onChange={(e) => onUpdateZoom(parseInt(e.target.value))}
            className="zoom-slider"
          />
          <ZoomIn size={14} />
          <span style={{ minWidth: '40px', textAlign: 'right', fontFamily: 'monospace' }}>{zoom}px/s</span>
        </div>
      </div>

      {/* Time Ruler */}
      <div className="timeline-ruler-container" ref={rulerRef} onClick={handleRulerClick}>
        <div className="timeline-ruler" style={{ width: `${timelineBuffer * zoom}px` }}>
          {ticks.map((tick) => {
            const isMajor = tick % labelInterval === 0;
            return (
              <React.Fragment key={tick}>
                <div
                  className={`ruler-tick ${isMajor ? 'major' : 'minor'}`}
                  style={{ left: `${tick * zoom}px` }}
                />
                {isMajor && (
                  <div
                    className="ruler-label"
                    style={{ left: `${tick * zoom}px` }}
                  >
                    {formatTime(tick).split('.')[0]} {/* show MM:SS */}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Tracks Area */}
      <div className="tracks-layout" ref={tracksViewportRef}>
        {/* Track Headers (Left Column) */}
        <div className="track-headers-column">
          {tracks.map((track) => (
            <div key={track.id} className="track-header-item">
              <div className="track-header-title">
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: track.type === 'video' ? 'var(--color-primary)' : 'var(--color-success)',
                  }}
                />
                {track.name}
              </div>
              <div className="track-header-controls">
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {track.type.toUpperCase()}
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button title="Toggle Visibility/Mute">
                    {track.type === 'video' ? <Eye size={12} /> : <Volume2 size={12} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Track Clips Canvas (Right Column, scrollable) */}
        <div className="tracks-canvas-column">
          <div
            className="tracks-viewport"
            style={{ width: `${timelineBuffer * zoom}px` }}
            onClick={() => onSelectClip(null)}
          >
            {/* Playhead vertical line */}
            <div
              className="playhead-line"
              style={{ left: `${playhead * zoom}px` }}
            >
              <div className="playhead-handle" />
            </div>

            {/* Render track rows */}
            {tracks.map((track) => (
              <div
                key={track.id}
                className={`track-row ${dragOverTrackId === track.id ? 'drag-over' : ''}`}
                onDragOver={(e) => handleTrackDragOver(e, track.id)}
                onDragLeave={handleTrackDragLeave}
                onDrop={(e) => handleTrackDrop(e, track.id)}
              >
                {track.clips.map((clip) => {
                  const left = clip.timeStart * zoom;
                  const width = (clip.timeEnd - clip.timeStart) * zoom;
                  const isSelected = clip.id === selectedClipId;

                  return (
                    <div
                      key={clip.id}
                      className={`clip-wrapper ${track.type} ${isSelected ? 'selected' : ''}`}
                      style={{
                        left: `${left}px`,
                        width: `${width}px`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectClip(clip.id);
                      }}
                      onMouseDown={(e) => handleClipMouseDown(e, clip, 'move')}
                    >
                      <div className="clip-title">{clip.name}</div>
                      
                      {/* Audio Visualizer Waveform Mockup */}
                      {track.type === 'audio' && (
                        <div className="waveform-canvas">
                          <svg width="100%" height="100%" viewBox="0 0 100 20" preserveAspectRatio="none">
                            <path
                              d="M0 10 Q10 2 20 18 T40 4 T60 16 T80 6 T100 10"
                              fill="none"
                              stroke="var(--color-success)"
                              strokeWidth="1.5"
                            />
                          </svg>
                        </div>
                      )}

                      <div className="clip-duration-label">
                        {((clip.timeEnd - clip.timeStart)).toFixed(2)}s
                      </div>

                      {/* Trim Handles */}
                      <div
                        className="trim-handle left"
                        onMouseDown={(e) => handleClipMouseDown(e, clip, 'trim-left')}
                      />
                      <div
                        className="trim-handle right"
                        onMouseDown={(e) => handleClipMouseDown(e, clip, 'trim-right')}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

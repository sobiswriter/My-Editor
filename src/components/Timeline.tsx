import React, { useRef, useState, useEffect } from 'react';
import type { Track, Clip, Asset } from '../types';
import { formatTime } from '../utils/time';
import { ZoomIn, ZoomOut, Magnet, Trash2, Split, Eye, Volume2, MousePointer, Scissors, Link, Plus } from 'lucide-react';

interface TimelineProps {
  tracks: Track[];
  assets: Asset[];
  playheadRef: React.RefObject<number>;
  zoom: number; // Pixels per second
  duration: number; // Project duration in seconds
  selectedClipId: string | null;
  activeTool: 'select' | 'blade';
  onChangeTool: (tool: 'select' | 'blade') => void;
  onSeek: (time: number) => void;
  onUpdateZoom: (zoom: number) => void;
  onUpdateClip: (clipId: string, updates: Partial<Clip>) => void;
  onSelectClip: (clipId: string | null) => void;
  onDeleteClip: (clipId: string) => void;
  onSplit: () => void;
  onAddClipToTrack: (assetId: string, trackId: string, timeStart: number) => void;
  onAddTrackAndClip: (type: 'video' | 'audio', assetId: string, timeStart: number, insertAt: 'top' | 'bottom') => void;
  onAddTrack: (type: 'video' | 'audio') => void;
  onJoinClips: (clipId1: string, clipId2: string) => void;
  onAddTextClip: () => void;
  onDetachAudio: (clipId: string) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  tracks,
  assets,
  playheadRef,
  zoom,
  duration,
  selectedClipId,
  activeTool,
  onChangeTool,
  onSeek,
  onUpdateZoom,
  onUpdateClip,
  onSelectClip,
  onDeleteClip,
  onSplit,
  onAddClipToTrack,
  onAddTrackAndClip,
  onAddTrack,
  onJoinClips,
  onAddTextClip,
  onDetachAudio,
}) => {
  const tracksViewportRef = useRef<HTMLDivElement>(null);
  const rulerCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isSnapping, setIsSnapping] = useState<boolean>(true);
  const [scrollLeft, setScrollLeft] = useState<number>(0);
  
  // Hover playhead line state
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Drag over states for dropping assets
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);
  const [dragOverDropZone, setDragOverDropZone] = useState<string | null>(null); // 'video-top' | 'video-bottom' | 'audio-bottom'

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
    linkedClip?: {
      clipId: string;
      initialTimeStart: number;
      initialTimeEnd: number;
      initialTrimStart: number;
      initialTrimEnd: number;
      clipDuration: number;
    };
  } | null>(null);

  // Redraw the canvas ruler when zoom, duration, or scroll position changes
  const drawRuler = () => {
    const canvas = rulerCanvasRef.current;
    const viewport = tracksViewportRef.current;
    if (!canvas || !viewport) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const sLeft = viewport.scrollLeft;

    // Clear background
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(0, 0, width, height);

    // Draw grid border bottom
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 1);
    ctx.lineTo(width, height - 1);
    ctx.stroke();

    // Determine tick interval spacing dynamically based on zoom
    let tickInt = 1;
    let labelInt = 5;
    if (zoom >= 180) {
      tickInt = 0.5;
      labelInt = 1;
    } else if (zoom >= 80) {
      tickInt = 1;
      labelInt = 5;
    } else if (zoom >= 30) {
      tickInt = 5;
      labelInt = 10;
    } else if (zoom >= 10) {
      tickInt = 10;
      labelInt = 30;
    } else if (zoom >= 4) {
      tickInt = 30;
      labelInt = 60; // Ticks every 30s, label every 1m
    } else {
      tickInt = 60;
      labelInt = 300; // Ticks every 1m, label every 5m
    }

    const startTime = sLeft / zoom;
    const endTime = (sLeft + width) / zoom;
    const firstTick = Math.floor(startTime / tickInt) * tickInt;

    ctx.fillStyle = '#9ca3af';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';

    for (let t = firstTick; t <= endTime; t += tickInt) {
      const x = t * zoom - sLeft;
      if (x < 0 || x > width) continue;

      const isMajor = Math.abs(t % labelInt) < 0.01;

      ctx.beginPath();
      ctx.moveTo(x, height - (isMajor ? 12 : 6));
      ctx.lineTo(x, height - 1);
      ctx.stroke();

      if (isMajor) {
        const mins = Math.floor(t / 60);
        const secs = Math.floor(t % 60);
        const label = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        ctx.fillText(label, x, 14);
      }
    }
  };

  useEffect(() => {
    drawRuler();
  }, [zoom, duration, scrollLeft]);

  // Handle resizing of the timeline panel window
  useEffect(() => {
    const handleResize = () => {
      drawRuler();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [zoom, duration, scrollLeft]);

  // Auto-scroll timeline to keep playhead centered when zooming
  const prevZoomRef = useRef(zoom);
  useEffect(() => {
    const viewport = tracksViewportRef.current;
    if (!viewport) return;
    
    if (prevZoomRef.current !== zoom) {
      const playheadPx = playheadRef.current * zoom;
      const newScrollLeft = playheadPx - viewport.clientWidth / 2;
      viewport.scrollLeft = Math.max(0, newScrollLeft);
      setScrollLeft(viewport.scrollLeft);
      prevZoomRef.current = zoom;
    }
  }, [zoom]);

  // Keep playhead in view during active playback (page-by-page jump scroll, throttled to 250ms interval)
  useEffect(() => {
    const interval = setInterval(() => {
      const viewport = tracksViewportRef.current;
      if (viewport) {
        const playheadPx = playheadRef.current * zoom;
        const scrollRightEdge = viewport.scrollLeft + viewport.clientWidth;
        
        // If playhead goes past right edge of screen, shift screen left
        if (playheadPx > scrollRightEdge - 15) {
          viewport.scrollLeft = playheadPx - 50;
          setScrollLeft(viewport.scrollLeft);
        }
        // If playhead goes behind left edge, shift screen right
        else if (playheadPx < viewport.scrollLeft) {
          viewport.scrollLeft = Math.max(0, playheadPx - 50);
          setScrollLeft(viewport.scrollLeft);
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [zoom]);

  // Snapping calculations
  const getSnapPoints = (excludeClipId: string): number[] => {
    if (!isSnapping) return [];
    const points: number[] = [0, playheadRef.current];
    tracks.forEach((t) => {
      t.clips.forEach((c) => {
        if (c.id !== excludeClipId && c.id !== findClip(excludeClipId)?.linkedClipId) {
          points.push(c.timeStart);
          points.push(c.timeEnd);
        }
      });
    });
    return Array.from(new Set(points));
  };

  const findClip = (clipId: string): Clip | null => {
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return clip;
    }
    return null;
  };

  const getMergeableNeighbor = (clipId: string): { clip: Clip; position: 'left' | 'right' } | null => {
    const clip = findClip(clipId);
    if (!clip) return null;

    const track = tracks.find((t) => t.id === clip.trackId);
    if (!track) return null;

    for (const other of track.clips) {
      if (other.id === clip.id || other.assetId !== clip.assetId) continue;

      if (Math.abs(clip.timeEnd - other.timeStart) < 0.05) {
        const sourceEnd = clip.trimStart + (clip.timeEnd - clip.timeStart) * clip.speed;
        if (Math.abs(sourceEnd - other.trimStart) < 0.05) {
          return { clip: other, position: 'right' };
        }
      }
      
      if (Math.abs(other.timeEnd - clip.timeStart) < 0.05) {
        const sourceEnd = other.trimStart + (other.timeEnd - other.timeStart) * other.speed;
        if (Math.abs(sourceEnd - clip.trimStart) < 0.05) {
          return { clip: other, position: 'left' };
        }
      }
    }

    return null;
  };

  const mergeableInfo = selectedClipId ? getMergeableNeighbor(selectedClipId) : null;

  // Ruler scrubbing (seeks immediately on mouse down and scrubs on drag)
  const handleRulerMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const viewport = tracksViewportRef.current;
    if (!viewport) return;

    const seekFromEvent = (event: MouseEvent) => {
      const rect = rulerCanvasRef.current!.getBoundingClientRect();
      const sLeft = viewport.scrollLeft;
      const x = event.clientX - rect.left;
      const time = Math.max(0, (sLeft + x) / zoom);
      onSeek(Math.min(time, duration));
    };

    seekFromEvent(e.nativeEvent);

    const handleMouseMove = (event: MouseEvent) => {
      seekFromEvent(event);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Click on tracks background (and clips) seeks playhead immediately
  const handleTracksViewportMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isBgClick =
      target.classList.contains('tracks-viewport') ||
      target.classList.contains('track-row') ||
      target.classList.contains('track-drop-zone');

    if (isBgClick) {
      if (!tracksViewportRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const sLeft = tracksViewportRef.current.scrollLeft;
      const clickX = e.clientX - rect.left + sLeft;
      const clickTime = clickX / zoom;
      onSeek(Math.max(0, clickTime));
      onSelectClip(null); // Deselect
    }
  };

  // Hover playhead updates
  const handleTracksMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tracksViewportRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sLeft = tracksViewportRef.current.scrollLeft;
    const x = e.clientX - rect.left + sLeft;
    setHoverX(x);
    setHoverTime(x / zoom);
  };

  const handleTracksMouseLeave = () => {
    setHoverX(null);
    setHoverTime(null);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  };

  // Dragging logic for Clips (Move & Trim)
  const handleClipMouseDown = (
    e: React.MouseEvent,
    clip: Clip,
    type: 'move' | 'trim-left' | 'trim-right'
  ) => {
    e.stopPropagation();
    onSelectClip(clip.id);

    // QoL addition: Clicking on a clip seeks playhead immediately in Select Mode too
    if (tracksViewportRef.current) {
      const rect = tracksViewportRef.current.getBoundingClientRect();
      const sLeft = tracksViewportRef.current.scrollLeft;
      const clickX = e.clientX - rect.left + sLeft;
      const clickTime = clickX / zoom;
      onSeek(Math.min(Math.max(0, clickTime), duration));
    }

    if (activeTool === 'blade') {
      handleBladeCut(e, clip);
      return;
    }

    const asset = assets.find((a) => a.id === clip.assetId);
    if (!asset) return;

    let linkedClipData;
    if (clip.linkedClipId) {
      const linked = findClip(clip.linkedClipId);
      if (linked) {
        linkedClipData = {
          clipId: linked.id,
          initialTimeStart: linked.timeStart,
          initialTimeEnd: linked.timeEnd,
          initialTrimStart: linked.trimStart,
          initialTrimEnd: linked.trimEnd,
          clipDuration: linked.timeEnd - linked.timeStart,
        };
      }
    }

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
      linkedClip: linkedClipData,
    });
  };

  const handleBladeCut = (e: React.MouseEvent, clip: Clip) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const relativeTime = clickX / zoom;
    const targetTimelineTime = clip.timeStart + relativeTime;

    if (targetTimelineTime > clip.timeStart && targetTimelineTime < clip.timeEnd) {
      onSeek(targetTimelineTime);
      setTimeout(() => {
        onSplit();
      }, 50);
    }
  };

  useEffect(() => {
    if (!activeDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - activeDrag.initialMouseX;
      const deltaTime = deltaX / zoom;

      const clip = findClip(activeDrag.clipId);
      if (!clip) return;

      const snapPoints = getSnapPoints(activeDrag.clipId);
      const snapThreshold = 10 / zoom;

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

        let snappedTimeStart = snapValue(newTimeStart);
        let snappedTimeEnd = snapValue(newTimeStart + activeDrag.clipDuration);

        if (snappedTimeStart !== newTimeStart) {
          newTimeStart = snappedTimeStart;
        } else if (snappedTimeEnd !== newTimeStart + activeDrag.clipDuration) {
          newTimeStart = snappedTimeEnd - activeDrag.clipDuration;
        }

        let newTrackId = activeDrag.initialTrackId;
        if (tracksViewportRef.current) {
          const rect = tracksViewportRef.current.getBoundingClientRect();
          const relativeY = e.clientY - rect.top;
          
          const trackIndex = Math.floor(relativeY / 84);
          const targetTrack = tracks[trackIndex];
          const sourceTrack = tracks.find((t) => t.id === activeDrag.initialTrackId);

          if (targetTrack && sourceTrack && targetTrack.type === sourceTrack.type) {
            newTrackId = targetTrack.id;
          }
        }

        onUpdateClip(activeDrag.clipId, {
          timeStart: Math.max(0, newTimeStart),
          timeEnd: Math.max(0, newTimeStart + activeDrag.clipDuration),
          trackId: newTrackId,
        });

        if (activeDrag.linkedClip) {
          onUpdateClip(activeDrag.linkedClip.clipId, {
            timeStart: Math.max(0, newTimeStart),
            timeEnd: Math.max(0, newTimeStart + activeDrag.linkedClip.clipDuration),
          });
        }

      } else if (activeDrag.type === 'trim-left') {
        let newTimeStart = activeDrag.initialTimeStart + deltaTime;
        newTimeStart = Math.max(0, newTimeStart);
        newTimeStart = snapValue(newTimeStart);

        const actualDelta = newTimeStart - activeDrag.initialTimeStart;
        const newTrimStart = activeDrag.initialTrimStart + actualDelta;

        if (newTrimStart >= 0 && newTimeStart < activeDrag.initialTimeEnd - 0.1) {
          onUpdateClip(activeDrag.clipId, {
            timeStart: newTimeStart,
            trimStart: newTrimStart,
          });

          if (activeDrag.linkedClip) {
            onUpdateClip(activeDrag.linkedClip.clipId, {
              timeStart: newTimeStart,
              trimStart: newTrimStart,
            });
          }
        }
      } else if (activeDrag.type === 'trim-right') {
        let newTimeEnd = activeDrag.initialTimeEnd + deltaTime;
        newTimeEnd = snapValue(newTimeEnd);

        const actualDelta = newTimeEnd - activeDrag.initialTimeEnd;
        const durationLimit = activeDrag.assetDuration - activeDrag.initialTrimStart;
        const newClipDuration = activeDrag.clipDuration + actualDelta;

        if (newClipDuration > 0.1 && newClipDuration <= durationLimit) {
          onUpdateClip(activeDrag.clipId, {
            timeEnd: newTimeEnd,
          });

          if (activeDrag.linkedClip) {
            onUpdateClip(activeDrag.linkedClip.clipId, {
              timeEnd: newTimeEnd,
            });
          }
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
  }, [activeDrag, zoom, tracks, isSnapping, activeTool]);

  // Asset Drag and Drop directly onto tracks
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

    const trackRow = e.currentTarget as HTMLDivElement;
    const rect = trackRow.getBoundingClientRect();
    const sLeft = tracksViewportRef.current?.scrollLeft || 0;
    const dropX = e.clientX - rect.left + sLeft;
    const timeStart = Math.max(0, dropX / zoom);

    onAddClipToTrack(assetId, trackId, timeStart);
  };

  // Dynamic drop zones for adding new tracks
  const handleZoneDragOver = (e: React.DragEvent, zone: string) => {
    e.preventDefault();
    setDragOverDropZone(zone);
  };

  const handleZoneDragLeave = () => {
    setDragOverDropZone(null);
  };

  const handleZoneDrop = (e: React.DragEvent, zone: 'video-top' | 'video-bottom' | 'audio-bottom') => {
    e.preventDefault();
    setDragOverDropZone(null);
    const assetId = e.dataTransfer.getData('text/plain');
    if (!assetId) return;

    const zoneEl = e.currentTarget as HTMLDivElement;
    const rect = zoneEl.getBoundingClientRect();
    const sLeft = tracksViewportRef.current?.scrollLeft || 0;
    const dropX = e.clientX - rect.left + sLeft;
    const timeStart = Math.max(0, dropX / zoom);

    if (zone === 'video-top') {
      onAddTrackAndClip('video', assetId, timeStart, 'top');
    } else if (zone === 'video-bottom') {
      onAddTrackAndClip('video', assetId, timeStart, 'bottom');
    } else if (zone === 'audio-bottom') {
      onAddTrackAndClip('audio', assetId, timeStart, 'bottom');
    }
  };

  const videoTracks = tracks.filter((t) => t.type === 'video');
  const audioTracks = tracks.filter((t) => t.type === 'audio');

  const maxTimelineWidth = Math.max(duration, 300) * zoom; // dynamic timeline scroll area width

  return (
    <div className="timeline-panel">
      {/* Toolbar */}
      <div className="timeline-toolbar">
        <div className="timeline-tools">
          <div className="tool-selector">
            <button
              className={`tool-button ${activeTool === 'select' ? 'active' : ''}`}
              onClick={() => onChangeTool('select')}
              title="Selection Tool (V)"
            >
              <MousePointer size={14} />
            </button>
            <button
              className={`tool-button ${activeTool === 'blade' ? 'active' : ''}`}
              onClick={() => onChangeTool('blade')}
              title="Blade Split Tool (B)"
            >
              <Scissors size={14} />
            </button>
          </div>

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

          {/* Add Text Button */}
          <button
            className="btn"
            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            onClick={onAddTextClip}
            title="Add Text Clip at playhead (T)"
          >
            <Plus size={14} />
            Add Text
          </button>

          {/* Detach Audio Button */}
          {selectedClipId && findClip(selectedClipId)?.linkedClipId && (
            <button
              className="btn btn-primary"
              style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'var(--color-warning)', color: '#000' }}
              onClick={() => onDetachAudio(selectedClipId)}
              title="Detach Audio Layer from Video"
            >
              Detach Audio
            </button>
          )}

          {mergeableInfo && (
            <button
              className="btn btn-primary"
              style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'var(--color-success)' }}
              onClick={() => onJoinClips(selectedClipId!, mergeableInfo.clip.id)}
              title="Heal Split / Join Adjacent clips"
            >
              <Link size={14} />
              Join Clips
            </button>
          )}

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

        {/* Zoom Control (1px/s for 15-30m range up to 250px/s) */}
        <div className="timeline-zoom">
          <ZoomOut size={14} />
          <input
            type="range"
            min="1"
            max="250"
            value={zoom}
            onChange={(e) => onUpdateZoom(parseInt(e.target.value))}
            className="zoom-slider"
          />
          <ZoomIn size={14} />
          <span style={{ minWidth: '40px', textAlign: 'right', fontFamily: 'monospace' }}>{zoom}px/s</span>
        </div>
      </div>

      {/* Canvas Time Ruler */}
      <div className="timeline-ruler-container">
        <canvas
          ref={rulerCanvasRef}
          onMouseDown={handleRulerMouseDown}
          style={{ width: '100%', height: '100%', cursor: 'ew-resize' }}
        />

        {/* Hover Time Pill Badge */}
        {hoverX !== null && hoverTime !== null && (
          <div className="hover-playhead-badge" style={{ left: `${hoverX - scrollLeft}px` }}>
            {formatTime(hoverTime)}
          </div>
        )}
      </div>

      {/* Tracks Area */}
      <div className="tracks-layout">
        {/* Track Headers Column (Left side) */}
        <div className="track-headers-column">
          {videoTracks.map((track) => (
            <div key={track.id} className="track-header-item" style={{ height: '80px', margin: '4px 0' }}>
              <div className="track-header-title">
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-primary)' }} />
                {track.name}
              </div>
              <div className="track-header-controls">
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>VIDEO</span>
                <button title="Toggle Visibility">
                  <Eye size={12} />
                </button>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px', background: 'rgba(0,0,0,0.1)' }}>
            <button className="btn" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => onAddTrack('video')}>
              <Plus size={10} /> Add Video Layer
            </button>
          </div>

          {audioTracks.map((track) => (
            <div key={track.id} className="track-header-item" style={{ height: '80px', margin: '4px 0' }}>
              <div className="track-header-title">
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-success)' }} />
                {track.name}
              </div>
              <div className="track-header-controls">
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>AUDIO</span>
                <button title="Mute Track">
                  <Volume2 size={12} />
                </button>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px', background: 'rgba(0,0,0,0.1)' }}>
            <button className="btn" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => onAddTrack('audio')}>
              <Plus size={10} /> Add Audio Layer
            </button>
          </div>
        </div>

        {/* Tracks Content (Right side, scrollable) */}
        <div className="tracks-canvas-column" ref={tracksViewportRef} onScroll={handleScroll}>
          <div
            className={`tracks-viewport ${activeTool === 'blade' ? 'blade-mode' : ''}`}
            style={{ width: `${maxTimelineWidth}px` }}
            onMouseDown={handleTracksViewportMouseDown}
            onMouseMove={handleTracksMouseMove}
            onMouseLeave={handleTracksMouseLeave}
          >
            {/* Playhead line pointer */}
            <div
              className="playhead-line"
              style={{ left: `${playheadRef.current * zoom}px` }}
            >
              <div className="playhead-handle" />
            </div>

            {/* Hover vertical playhead guideline */}
            {hoverX !== null && (
              <div className="hover-playhead-line" style={{ left: `${hoverX}px` }} />
            )}

            {/* Drop Zone: Create Video track on top */}
            <div
              className={`track-drop-zone ${dragOverDropZone === 'video-top' ? 'drag-over' : ''}`}
              onDragOver={(e) => handleZoneDragOver(e, 'video-top')}
              onDragLeave={handleZoneDragLeave}
              onDrop={(e) => handleZoneDrop(e, 'video-top')}
            >
              + Drop asset here to create new top Video Layer
            </div>

            {/* Video tracks rows */}
            {videoTracks.map((track) => (
              <div
                key={track.id}
                className={`track-row ${dragOverTrackId === track.id ? 'drag-over' : ''}`}
                style={{ height: '80px', margin: '4px 0' }}
                onDragOver={(e) => handleTrackDragOver(e, track.id)}
                onDragLeave={handleTrackDragLeave}
                onDrop={(e) => handleTrackDrop(e, track.id)}
              >
                {track.clips.map((clip) => {
                  const left = clip.timeStart * zoom;
                  const width = (clip.timeEnd - clip.timeStart) * zoom;
                  const isSelected = clip.id === selectedClipId;

                  const isTextClip = clip.text !== undefined;

                  return (
                    <div
                      key={clip.id}
                      className={`clip-wrapper video ${isSelected ? 'selected' : ''}`}
                      style={{
                        left: `${left}px`,
                        width: `${width}px`,
                        background: isTextClip ? 'linear-gradient(135deg, rgba(236, 72, 153, 0.25) 0%, rgba(244, 63, 94, 0.15) 100%)' : undefined,
                        borderColor: isTextClip ? 'rgba(236, 72, 153, 0.4)' : undefined,
                      }}
                      onMouseDown={(e) => handleClipMouseDown(e, clip, 'move')}
                    >
                      <div className="clip-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {clip.linkedClipId && <Link size={10} style={{ color: 'var(--color-primary)' }} />}
                        {clip.name}
                      </div>

                      {/* Video clip thumbnails mockup (Patrick Star layout) or Text Preview */}
                      {isTextClip ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '24px', opacity: 0.6, fontSize: '0.7rem', color: '#f472b6', fontStyle: 'italic', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          <span>📝 "{clip.text}"</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '2px', height: '24px', opacity: 0.35, pointerEvents: 'none', overflow: 'hidden' }}>
                          {Array.from({ length: Math.ceil(width / 32) }).map((_, idx) => (
                            <div key={idx} style={{ width: '30px', height: '24px', background: 'rgba(0,0,0,0.4)', borderRadius: '2px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: '0.5rem', transform: 'scale(0.8)' }}>🎞️</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="clip-duration-label">
                        {((clip.timeEnd - clip.timeStart)).toFixed(2)}s
                      </div>

                      {/* Blade Mode Cut Indicator */}
                      {activeTool === 'blade' && hoverX !== null && hoverX >= left && hoverX <= left + width && (
                        <div className="clip-blade-indicator" style={{ left: `${hoverX - left}px` }} />
                      )}

                      {/* Trim Handles (only visible in Select Mode) */}
                      {activeTool === 'select' && (
                        <>
                          <div
                            className="trim-handle left"
                            onMouseDown={(e) => handleClipMouseDown(e, clip, 'trim-left')}
                          />
                          <div
                            className="trim-handle right"
                            onMouseDown={(e) => handleClipMouseDown(e, clip, 'trim-right')}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Drop Zone: Create Video track at bottom / Audio track at top */}
            <div
              className={`track-drop-zone ${dragOverDropZone === 'video-bottom' ? 'drag-over' : ''}`}
              onDragOver={(e) => handleZoneDragOver(e, 'video-bottom')}
              onDragLeave={handleZoneDragLeave}
              onDrop={(e) => handleZoneDrop(e, 'video-bottom')}
            >
              + Drop asset here to create a new middle Video Layer
            </div>

            {/* Audio tracks rows */}
            {audioTracks.map((track) => (
              <div
                key={track.id}
                className={`track-row ${dragOverTrackId === track.id ? 'drag-over' : ''}`}
                style={{ height: '80px', margin: '4px 0' }}
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
                      className={`clip-wrapper audio ${isSelected ? 'selected' : ''}`}
                      style={{
                        left: `${left}px`,
                        width: `${width}px`,
                      }}
                      onMouseDown={(e) => handleClipMouseDown(e, clip, 'move')}
                    >
                      <div className="clip-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {clip.linkedClipId && <Link size={10} style={{ color: 'var(--color-success)' }} />}
                        {clip.name}
                      </div>

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

                      <div className="clip-duration-label">
                        {((clip.timeEnd - clip.timeStart)).toFixed(2)}s
                      </div>

                      {/* Blade Mode Cut Indicator */}
                      {activeTool === 'blade' && hoverX !== null && hoverX >= left && hoverX <= left + width && (
                        <div className="clip-blade-indicator" style={{ left: `${hoverX - left}px` }} />
                      )}

                      {/* Trim Handles (only visible in Select Mode) */}
                      {activeTool === 'select' && (
                        <>
                          <div
                            className="trim-handle left"
                            onMouseDown={(e) => handleClipMouseDown(e, clip, 'trim-left')}
                          />
                          <div
                            className="trim-handle right"
                            onMouseDown={(e) => handleClipMouseDown(e, clip, 'trim-right')}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Drop Zone: Create Audio track at bottom */}
            <div
              className={`track-drop-zone ${dragOverDropZone === 'audio-bottom' ? 'drag-over' : ''}`}
              onDragOver={(e) => handleZoneDragOver(e, 'audio-bottom')}
              onDragLeave={handleZoneDragLeave}
              onDrop={(e) => handleZoneDrop(e, 'audio-bottom')}
            >
              + Drop asset here to create a new bottom Audio Layer
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

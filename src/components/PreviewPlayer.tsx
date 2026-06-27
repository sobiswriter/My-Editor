import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Square, SkipBack, SkipForward, Scissors, Volume2, VolumeX, Maximize2, ChevronDown, Check } from 'lucide-react';
import { formatTime } from '../utils/time';
import type { Track, Clip } from '../types';

interface PreviewPlayerProps {
  isPlaying: boolean;
  playhead: number;
  duration: number;
  tracks: Track[];
  selectedClipId: string | null;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '4:5' | '21:9' | '2:3';
  onChangeAspectRatio: (ratio: any) => void;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSplit: () => void;
  mediaElements: Map<string, HTMLMediaElement>;
  onUpdateClip: (clipId: string, updates: Partial<Clip>) => void;
  masterVolume: number;
  onChangeMasterVolume: (volume: number) => void;
  isMuted: boolean;
  onChangeMuted: (muted: boolean) => void;
  masterSpeed: number;
  onChangeMasterSpeed: (speed: number) => void;
}

const ASPECT_RATIO_PRESETS = [
  { value: '16:9', label: 'Wide 16:9', desc: 'YouTube and streaming sites', width: 1280, height: 720 },
  { value: '9:16', label: 'Vertical 9:16', desc: 'Instagram Reels and TikTok', width: 720, height: 1280 },
  { value: '1:1', label: 'Square 1:1', desc: 'Instagram posts', width: 1080, height: 1080 },
  { value: '4:3', label: 'Classic 4:3', desc: 'Older TVs and webcams', width: 960, height: 720 },
  { value: '4:5', label: 'Social 4:5', desc: 'Portrait Instagram posts', width: 864, height: 1080 },
  { value: '21:9', label: 'Cinema 21:9', desc: 'Ultra-wide movies', width: 1680, height: 720 },
  { value: '2:3', label: 'Portrait 2:3', desc: 'Pinterest and photos', width: 720, height: 1080 },
];

export const PreviewPlayer: React.FC<PreviewPlayerProps> = ({
  isPlaying,
  playhead,
  duration,
  tracks,
  selectedClipId,
  aspectRatio,
  onChangeAspectRatio,
  onTogglePlay,
  onSeek,
  onSplit,
  mediaElements,
  onUpdateClip,
  masterVolume,
  onChangeMasterVolume,
  isMuted,
  onChangeMuted,
  masterSpeed,
  onChangeMasterSpeed,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  
  const [showAspectMenu, setShowAspectMenu] = useState<boolean>(false);
  
  // Canvas dragging state to position clips directly on canvas
  const [isDraggingClip, setIsDraggingClip] = useState<boolean>(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initialClipX: number; initialClipY: number } | null>(null);

  const activePreset = ASPECT_RATIO_PRESETS.find((p) => p.value === aspectRatio) || ASPECT_RATIO_PRESETS[0];

  const findClipById = (id: string): Clip | null => {
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === id);
      if (clip) return clip;
    }
    return null;
  };

  const getSelectedClip = (): Clip | null => {
    if (!selectedClipId) return null;
    return findClipById(selectedClipId);
  };

  // Canvas drawing loop with transforms & text layers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set logical width/height to match selected aspect ratio preset
    canvas.width = activePreset.width;
    canvas.height = activePreset.height;

    const render = () => {
      const currentPlayhead = (window as any).masterPlayhead !== undefined ? (window as any).masterPlayhead : playhead;

      // Clear background
      ctx.fillStyle = '#06070a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      drawCheckerboard(ctx, canvas.width, canvas.height);

      // Gather active video/text tracks (sorted from bottom to top)
      const videoTracks = tracks.filter((t) => t.type === 'video');

      for (let i = videoTracks.length - 1; i >= 0; i--) {
        const track = videoTracks[i];
        const activeClip = track.clips.find(
          (clip) => currentPlayhead >= clip.timeStart && currentPlayhead <= clip.timeEnd
        );

        if (activeClip) {
          ctx.save();

          // Clip parameters
          const posX = activeClip.x ?? 0;
          const posY = activeClip.y ?? 0;
          const scale = activeClip.scale ?? 1.0;
          const rotation = activeClip.rotation ?? 0;
          const flipH = activeClip.flipH ?? false;
          const flipV = activeClip.flipV ?? false;
          const fitMode = activeClip.fitMode ?? 'fit';

          // 1. Translate to clip's center
          const cx = canvas.width / 2 + posX;
          const cy = canvas.height / 2 + posY;
          ctx.translate(cx, cy);

          // 2. Rotate
          ctx.rotate((rotation * Math.PI) / 180);

          // 3. Mirror/Flips and Scale
          ctx.scale(flipH ? -scale : scale, flipV ? -scale : scale);

          // Render Text layer
          if (activeClip.text !== undefined) {
            ctx.fillStyle = activeClip.textColor || '#ffffff';
            const fSize = activeClip.fontSize || 48;
            ctx.font = `bold ${fSize}px Outfit, Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Draw text centered at translated (0, 0) coordinates
            ctx.fillText(activeClip.text, 0, 0);
          } 
          // Render Video / Image elements
          else {
            const el = mediaElements.get(activeClip.id);
            if (el && el.readyState >= 2) {
              const video = el as HTMLVideoElement;
              const sourceW = video.videoWidth || 640;
              const sourceH = video.videoHeight || 360;

              let w = sourceW;
              let h = sourceH;

              // Calculate bounding box based on Fit Mode
              if (fitMode === 'fit') {
                const ratio = Math.min(canvas.width / sourceW, canvas.height / sourceH);
                w = sourceW * ratio;
                h = sourceH * ratio;
              } else if (fitMode === 'fill') {
                const ratio = Math.max(canvas.width / sourceW, canvas.height / sourceH);
                w = sourceW * ratio;
                h = sourceH * ratio;
              } else if (fitMode === 'stretch') {
                w = canvas.width;
                h = canvas.height;
              }

              // DrawCentered at (0, 0)
              ctx.drawImage(video, -w / 2, -h / 2, w, h);
            }
          }

          ctx.restore();
        }
      }

      // Check if any visual layer is rendering
      const hasActiveVisual = videoTracks.some((t) =>
        t.clips.some((clip) => currentPlayhead >= clip.timeStart && currentPlayhead <= clip.timeEnd)
      );

      if (!hasActiveVisual) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No clip at playhead', canvas.width / 2, canvas.height / 2);
      }

      // Highlight selected clip with a border overlay on Canvas (only in Select mode)
      const selectedClip = getSelectedClip();
      if (selectedClip && currentPlayhead >= selectedClip.timeStart && currentPlayhead <= selectedClip.timeEnd) {
        ctx.save();
        const posX = selectedClip.x ?? 0;
        const posY = selectedClip.y ?? 0;
        const scale = selectedClip.scale ?? 1.0;
        const rotation = selectedClip.rotation ?? 0;

        ctx.translate(canvas.width / 2 + posX, canvas.height / 2 + posY);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(scale, scale);

        // Simple bounding box outline
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        
        let outlineW = 320;
        let outlineH = 180;

        if (selectedClip.text !== undefined) {
          outlineW = 400;
          outlineH = (selectedClip.fontSize || 48) * 1.5;
        } else {
          const el = mediaElements.get(selectedClip.id);
          if (el) {
            const video = el as HTMLVideoElement;
            outlineW = video.videoWidth || 640;
            outlineH = video.videoHeight || 360;
            if (selectedClip.fitMode === 'fit') {
              const ratio = Math.min(canvas.width / outlineW, canvas.height / outlineH);
              outlineW *= ratio;
              outlineH *= ratio;
            } else if (selectedClip.fitMode === 'fill') {
              const ratio = Math.max(canvas.width / outlineW, canvas.height / outlineH);
              outlineW *= ratio;
              outlineH *= ratio;
            } else if (selectedClip.fitMode === 'stretch') {
              outlineW = canvas.width;
              outlineH = canvas.height;
            }
          }
        }

        ctx.strokeRect(-outlineW / 2 - 8, -outlineH / 2 - 8, outlineW + 16, outlineH + 16);
        ctx.restore();
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [playhead, tracks, mediaElements, aspectRatio]);

  const drawCheckerboard = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const size = 20;
    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#10121a';
    for (let y = 0; y < h; y += size) {
      for (let x = (y / size) % 2 === 0 ? 0 : size; x < w; x += size * 2) {
        ctx.fillRect(x, y, size, size);
      }
    }
  };

  // Canvas Mouse Down: Detect click on selected clip and start dragging
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const selectedClip = getSelectedClip();
    if (!selectedClip || !canvasRef.current) return;

    // Check if the clip is active at playhead
    if (playhead < selectedClip.timeStart || playhead > selectedClip.timeEnd) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Mouse relative to canvas display bounds
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    setIsDraggingClip(true);
    dragStartRef.current = {
      mouseX: clickX,
      mouseY: clickY,
      initialClipX: selectedClip.x ?? 0,
      initialClipY: selectedClip.y ?? 0,
    };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingClip || !dragStartRef.current || !canvasRef.current || !selectedClipId) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const currentMouseX = e.clientX - rect.left;
    const currentMouseY = e.clientY - rect.top;

    const deltaX = currentMouseX - dragStartRef.current.mouseX;
    const deltaY = currentMouseY - dragStartRef.current.mouseY;

    // Convert screen coordinates delta to logical canvas coordinates delta
    const logicalDeltaX = (deltaX / canvas.clientWidth) * canvas.width;
    const logicalDeltaY = (deltaY / canvas.clientHeight) * canvas.height;

    onUpdateClip(selectedClipId, {
      x: Math.round(dragStartRef.current.initialClipX + logicalDeltaX),
      y: Math.round(dragStartRef.current.initialClipY + logicalDeltaY),
    });
  };

  const handleCanvasMouseUp = () => {
    setIsDraggingClip(false);
    dragStartRef.current = null;
  };

  const handleStop = () => {
    if (isPlaying) onTogglePlay();
    onSeek(0);
  };

  const handleStepFrame = (seconds: number) => {
    const newPlayhead = Math.max(0, Math.min(duration, playhead + seconds));
    onSeek(newPlayhead);
  };

  const toggleFullscreen = () => {
    if (canvasRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        canvasRef.current.requestFullscreen().catch(() => {});
      }
    }
  };

  // Preset container size styles
  const getContainerStyles = (): React.CSSProperties => {
    switch (aspectRatio) {
      case '16:9': return { aspectRatio: '16/9', maxWidth: '800px', width: '100%' };
      case '9:16': return { aspectRatio: '9/16', maxHeight: '420px', width: '236px' };
      case '1:1': return { aspectRatio: '1/1', maxHeight: '420px', width: '420px' };
      case '4:3': return { aspectRatio: '4/3', maxWidth: '560px', width: '100%' };
      case '4:5': return { aspectRatio: '4/5', maxHeight: '420px', width: '336px' };
      case '21:9': return { aspectRatio: '21/9', maxWidth: '800px', width: '100%' };
      case '2:3': return { aspectRatio: '2/3', maxHeight: '420px', width: '280px' };
      default: return { aspectRatio: '16/9', maxWidth: '800px', width: '100%' };
    }
  };

  return (
    <div className="player-panel">
      {/* Aspect Ratio Menu Trigger */}
      <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 30 }}>
        <button
          className="btn glass"
          style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          onClick={() => setShowAspectMenu(!showAspectMenu)}
        >
          <span>Ratio: {activePreset.label}</span>
          <ChevronDown size={14} />
        </button>

        {showAspectMenu && (
          <div
            className="glass"
            style={{
              position: 'absolute',
              top: '36px',
              right: 0,
              width: '260px',
              borderRadius: '8px',
              background: '#0d0e14',
              border: '1px solid var(--border-medium)',
              padding: '6px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {ASPECT_RATIO_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className="btn"
                style={{
                  background: aspectRatio === preset.value ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                  border: 'none',
                  justifyContent: 'flex-start',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  textAlign: 'left',
                  display: 'grid',
                  gridTemplateColumns: '20px 1fr',
                  alignItems: 'center',
                }}
                onClick={() => {
                  onChangeAspectRatio(preset.value);
                  setShowAspectMenu(false);
                }}
              >
                <div>{aspectRatio === preset.value && <Check size={14} style={{ color: 'var(--color-primary)' }} />}</div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>{preset.label}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{preset.desc}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dynamic Viewport Container */}
      <div className="canvas-container" style={getContainerStyles()}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          className="main-preview-canvas"
          style={{ cursor: isDraggingClip ? 'grabbing' : selectedClipId ? 'grab' : 'default' }}
        />
      </div>

      <div className="player-controls-bar">
        <div className="player-time">
          <span className="player-time-current">{formatTime(playhead)}</span>
          <span> / </span>
          <span>{formatTime(duration)}</span>
        </div>

        <div className="player-buttons">
          <button className="btn btn-icon" onClick={() => handleStepFrame(-1 / 30)} title="Previous Frame">
            <SkipBack size={16} />
          </button>
          
          <button
            className="btn btn-icon btn-primary"
            style={{ width: '44px', height: '44px' }}
            onClick={onTogglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={20} fill="white" /> : <Play size={20} fill="white" />}
          </button>

          <button className="btn btn-icon" onClick={handleStop} title="Stop">
            <Square size={16} fill="currentColor" />
          </button>

          <button className="btn btn-icon" onClick={() => handleStepFrame(1 / 30)} title="Next Frame">
            <SkipForward size={16} />
          </button>

          <button
            className={`btn btn-icon ${selectedClipId ? 'btn-accent' : ''}`}
            onClick={onSplit}
            disabled={!selectedClipId}
            title="Split Clip (S)"
            style={{ marginLeft: '12px' }}
          >
            <Scissors size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Master Speed Control Dropdown */}
          <select
            className="input-select"
            style={{ width: '65px', padding: '2px 4px', fontSize: '0.75rem', height: '28px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-medium)', borderRadius: '4px', cursor: 'pointer' }}
            value={masterSpeed}
            onChange={(e) => onChangeMasterSpeed(parseFloat(e.target.value))}
            title="Master Playback Speed"
          >
            <option value="0.5">0.5x</option>
            <option value="1.0">1.0x</option>
            <option value="1.5">1.5x</option>
            <option value="2.0">2.0x</option>
          </select>

          {/* Master Volume Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              className="btn btn-icon"
              style={{ width: '28px', height: '28px', padding: 0 }}
              onClick={() => onChangeMuted(!isMuted)}
            >
              {isMuted || masterVolume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : masterVolume}
              onChange={(e) => {
                onChangeMasterVolume(parseFloat(e.target.value));
                onChangeMuted(false);
              }}
              style={{ width: '60px', accentColor: 'var(--color-primary)' }}
            />
          </div>

          <button
            className="btn btn-icon"
            style={{ width: '32px', height: '32px', padding: 0 }}
            onClick={toggleFullscreen}
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

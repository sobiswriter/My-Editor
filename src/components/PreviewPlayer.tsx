import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Square, SkipBack, SkipForward, Scissors, Volume2, VolumeX, Maximize2 } from 'lucide-react';
import { formatTime } from '../utils/time';
import type { Track, Clip } from '../types';

interface PreviewPlayerProps {
  isPlaying: boolean;
  playhead: number;
  duration: number;
  tracks: Track[];
  selectedClipId: string | null;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSplit: () => void;
  mediaElements: Map<string, HTMLMediaElement>;
}

export const PreviewPlayer: React.FC<PreviewPlayerProps> = ({
  isPlaying,
  playhead,
  duration,
  tracks,
  selectedClipId,
  onTogglePlay,
  onSeek,
  onSplit,
  mediaElements,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Sync volume of all media elements when volume/mute state changes
  useEffect(() => {
    mediaElements.forEach((el, clipId) => {
      const clip = findClipById(clipId);
      if (clip) {
        el.volume = isMuted ? 0 : volume * clip.volume;
      }
    });
  }, [volume, isMuted, mediaElements, tracks]);

  const findClipById = (id: string): Clip | null => {
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === id);
      if (clip) return clip;
    }
    return null;
  };

  // Canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      // Clear canvas
      ctx.fillStyle = '#06070a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw background placeholder checkerboard pattern
      drawCheckerboard(ctx, canvas.width, canvas.height);

      // Find all active video tracks and sort them from bottom to top (rendering order)
      // We will render video tracks in reverse order (assuming bottom track is index length-1, top is 0)
      // Or we can define a fixed convention: track index 0 is rendered first, and higher indexes overlay.
      // Let's sort tracks such that video tracks with higher index or specific layout order overlay.
      // Let's draw bottom video tracks first so top tracks overlay.
      const videoTracks = tracks.filter((t) => t.type === 'video');
      
      // Let's draw from bottom to top (assuming tracks[0] is the top video track, we should draw tracks[tracks.length-1] first)
      for (let i = videoTracks.length - 1; i >= 0; i--) {
        const track = videoTracks[i];
        
        // Find active clip on this track
        const activeClip = track.clips.find(
          (clip) => playhead >= clip.timeStart && playhead <= clip.timeEnd
        );

        if (activeClip) {
          const el = mediaElements.get(activeClip.id) as HTMLVideoElement;
          if (el && el.tagName === 'VIDEO' && el.readyState >= 2) {
            // Draw video frame
            ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
          }
        }
      }

      // If no video is active, draw a "No Media" text
      const hasActiveVideo = videoTracks.some((t) =>
        t.clips.some((clip) => playhead >= clip.timeStart && playhead <= clip.timeEnd)
      );

      if (!hasActiveVideo) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No video at playhead', canvas.width / 2, canvas.height / 2);
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [playhead, tracks, mediaElements]);

  // Helper to draw checkerboard background
  const drawCheckerboard = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const size = 16;
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0f1115';
    for (let y = 0; y < h; y += size) {
      for (let x = (y / size) % 2 === 0 ? 0 : size; x < w; x += size * 2) {
        ctx.fillRect(x, y, size, size);
      }
    }
  };

  const handleStop = () => {
    if (isPlaying) onTogglePlay();
    onSeek(0);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val > 0) setIsMuted(false);
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

  return (
    <div className="player-panel">
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="main-preview-canvas"
        />
      </div>

      <div className="player-controls-bar">
        {/* Playback status times */}
        <div className="player-time">
          <span className="player-time-current">{formatTime(playhead)}</span>
          <span> / </span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Playback Controls */}
        <div className="player-buttons">
          <button className="btn btn-icon" onClick={() => handleStepFrame(-1 / 30)} title="Previous Frame (Left Arrow)">
            <SkipBack size={16} />
          </button>
          
          <button
            className="btn btn-icon btn-primary"
            style={{ width: '44px', height: '44px' }}
            onClick={onTogglePlay}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause size={20} fill="white" /> : <Play size={20} fill="white" />}
          </button>

          <button className="btn btn-icon" onClick={handleStop} title="Stop & Reset">
            <Square size={16} fill="currentColor" />
          </button>

          <button className="btn btn-icon" onClick={() => handleStepFrame(1 / 30)} title="Next Frame (Right Arrow)">
            <SkipForward size={16} />
          </button>

          <button
            className={`btn btn-icon ${selectedClipId ? 'btn-accent' : ''}`}
            onClick={onSplit}
            disabled={!selectedClipId}
            title="Split selected clip at playhead (S)"
            style={{ marginLeft: '12px' }}
          >
            <Scissors size={16} />
          </button>
        </div>

        {/* Volume & Fullscreen */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn btn-icon"
              style={{ width: '28px', height: '28px', padding: 0 }}
              onClick={() => setIsMuted(!isMuted)}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              style={{ width: '70px', accentColor: 'var(--color-primary)' }}
            />
          </div>

          <button
            className="btn btn-icon"
            style={{ width: '32px', height: '32px', padding: 0 }}
            onClick={toggleFullscreen}
            title="Fullscreen Preview"
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

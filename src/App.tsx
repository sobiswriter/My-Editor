import { useState, useEffect, useRef } from 'react';
import type { Asset, Clip, Track } from './types';
import { AssetLibrary } from './components/AssetLibrary';
import { PreviewPlayer } from './components/PreviewPlayer';
import { Timeline } from './components/Timeline';
import { ClipControls } from './components/ClipControls';
import { ExportModal } from './components/ExportModal';
import { Film, FolderOpen, Save, Settings } from 'lucide-react';

const DEFAULT_TRACKS: Track[] = [
  { id: 'v1', name: 'Video Track 1', type: 'video', clips: [] },
  { id: 'v2', name: 'Video Track 2', type: 'video', clips: [] },
  { id: 'a1', name: 'Audio Track 1', type: 'audio', clips: [] },
  { id: 'a2', name: 'Audio Track 2', type: 'audio', clips: [] },
];

function App() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tracks, setTracks] = useState<Track[]>(DEFAULT_TRACKS);
  const [playhead, setPlayhead] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(80);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'assets' | 'properties'>('assets');
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);

  // Hidden video/audio elements pool mapping clipId -> mediaElement
  const mediaElementsRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  const [mediaElementsMap, setMediaElementsMap] = useState<Map<string, HTMLMediaElement>>(new Map());

  // Master project duration (highest clip timeEnd, min 10 seconds)
  const duration = Math.max(10, ...tracks.flatMap((t) => t.clips.map((c) => c.timeEnd)));

  // 1. Playback Timer Loop
  const lastTickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isPlaying) {
      lastTickRef.current = null;
      return;
    }

    let animId: number;
    const tick = (now: number) => {
      if (lastTickRef.current === null) {
        lastTickRef.current = now;
      }
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      setPlayhead((prev) => {
        const next = prev + delta;
        if (next >= duration) {
          setIsPlaying(false);
          return duration;
        }
        return next;
      });

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, duration]);

  // 2. Synchronize Media Elements Pool (when tracks or assets change)
  useEffect(() => {
    const activeClipIds = new Set<string>();
    tracks.forEach((track) => {
      track.clips.forEach((clip) => {
        activeClipIds.add(clip.id);
      });
    });

    // Remove deleted clips elements
    mediaElementsRef.current.forEach((el, clipId) => {
      if (!activeClipIds.has(clipId)) {
        el.pause();
        el.src = '';
        el.load();
        mediaElementsRef.current.delete(clipId);
      }
    });

    // Create new clips elements
    let changed = false;
    tracks.forEach((track) => {
      track.clips.forEach((clip) => {
        if (!mediaElementsRef.current.has(clip.id)) {
          const asset = assets.find((a) => a.id === clip.assetId);
          if (asset) {
            const el = document.createElement(track.type === 'video' ? 'video' : 'audio');
            el.src = asset.url;
            el.preload = 'auto';
            el.crossOrigin = 'anonymous';
            el.volume = clip.volume;
            el.playbackRate = clip.speed;
            
            // Loop capability if clip duration is larger than source (e.g. images or repeating audio)
            if (asset.type === 'audio' || asset.type === 'video') {
              // Standard behavior is boundary clipping, not looping.
            }

            mediaElementsRef.current.set(clip.id, el);
            changed = true;
          }
        }
      });
    });

    if (changed || activeClipIds.size !== mediaElementsRef.current.size) {
      setMediaElementsMap(new Map(mediaElementsRef.current));
    }
  }, [tracks, assets]);

  // 3. Playback Synchronization: Seek, speed, volume, play/pause
  useEffect(() => {
    tracks.forEach((track) => {
      track.clips.forEach((clip) => {
        const el = mediaElementsRef.current.get(clip.id);
        if (!el) return;

        const isActive = playhead >= clip.timeStart && playhead <= clip.timeEnd;
        if (isActive) {
          // Calculate source playhead coordinate
          const targetSourceTime = clip.trimStart + (playhead - clip.timeStart) * clip.speed;

          if (el.playbackRate !== clip.speed) el.playbackRate = clip.speed;
          if (el.volume !== clip.volume) el.volume = clip.volume;

          // Sync Play/Pause
          if (isPlaying && el.paused) {
            el.play().catch(() => {});
          } else if (!isPlaying && !el.paused) {
            el.pause();
          }

          // Frame Seek Sync (only seek if deviation is > 0.12s to avoid audio popping and stutter)
          if (Math.abs(el.currentTime - targetSourceTime) > 0.12) {
            el.currentTime = targetSourceTime;
          }
        } else {
          // Pause if clip is out of playhead range
          if (!el.paused) {
            el.pause();
          }
        }
      });
    });
  }, [playhead, isPlaying, tracks, mediaElementsMap]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      } else if (e.code === 'KeyS') {
        e.preventDefault();
        handleSplit();
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedClipId) {
          e.preventDefault();
          handleDeleteClip(selectedClipId);
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setPlayhead((prev) => Math.max(0, prev - 1 / 30));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setPlayhead((prev) => Math.min(duration, prev + 1 / 30));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, selectedClipId, duration, tracks]);

  // Asset Import Handlers
  const handleAddAsset = (file: File) => {
    const url = URL.createObjectURL(file);
    const type = file.type.split('/')[0] as Asset['type'];

    if (type === 'video' || type === 'audio') {
      const tempEl = document.createElement(type);
      tempEl.src = url;
      tempEl.onloadedmetadata = () => {
        const asset: Asset = {
          id: 'asset_' + Math.random().toString(36).substr(2, 9),
          name: file.name,
          type,
          url,
          duration: tempEl.duration,
          file,
        };
        setAssets((prev) => [...prev, asset]);
      };
    } else if (type === 'image' || file.type.startsWith('image/')) {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        const asset: Asset = {
          id: 'asset_' + Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: 'image',
          url,
          duration: 5.0, // Default duration for image clips is 5s
          width: img.width,
          height: img.height,
          file,
        };
        setAssets((prev) => [...prev, asset]);
      };
    }
  };

  const handleRemoveAsset = (id: string) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    // Remove any clips referencing this asset
    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: track.clips.filter((clip) => clip.assetId !== id),
      }))
    );
    if (selectedClipId) {
      const isReferencing = tracks.some(t => t.clips.some(c => c.id === selectedClipId && c.assetId === id));
      if (isReferencing) setSelectedClipId(null);
    }
  };

  const handleAddToTimeline = (asset: Asset) => {
    // Find compatible track
    const targetType = asset.type === 'audio' ? 'audio' : 'video';
    const compatibleTrack = tracks.find((t) => t.type === targetType);
    if (compatibleTrack) {
      handleAddNewClipToTrack(asset.id, compatibleTrack.id, playhead);
    }
  };

  // Add new clip to a specific track
  const handleAddNewClipToTrack = (assetId: string, trackId: string, timeStart: number) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;

    const newClip: Clip = {
      id: 'clip_' + Math.random().toString(36).substr(2, 9),
      assetId,
      trackId,
      timeStart,
      timeEnd: timeStart + asset.duration,
      trimStart: 0,
      trimEnd: 0,
      volume: 1.0,
      speed: 1.0,
      name: asset.name,
    };

    setTracks((prev) =>
      prev.map((track) => {
        if (track.id === trackId) {
          return { ...track, clips: [...track.clips, newClip] };
        }
        return track;
      })
    );
    setSelectedClipId(newClip.id);
    setActiveTab('properties');
  };

  // Update clip properties (drag, trim, properties panel)
  const handleUpdateClip = (clipId: string, updates: Partial<Clip>) => {
    setTracks((prev) =>
      prev.map((track) => {
        // Remove from old track if trackId has changed (track drag and drop)
        if (updates.trackId && updates.trackId !== track.id && track.clips.some((c) => c.id === clipId)) {
          return { ...track, clips: track.clips.filter((c) => c.id !== clipId) };
        }
        // Add to new track if it matches updates.trackId
        if (updates.trackId && updates.trackId === track.id && !track.clips.some((c) => c.id === clipId)) {
          const oldClip = findClipAcrossTracks(clipId);
          if (oldClip) {
            const updated = { ...oldClip, ...updates };
            return { ...track, clips: [...track.clips, updated] };
          }
        }
        // Otherwise, update inside original track
        return {
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id === clipId) {
              return { ...clip, ...updates };
            }
            return clip;
          }),
        };
      })
    );
  };

  const findClipAcrossTracks = (clipId: string): Clip | null => {
    for (const track of tracks) {
      const found = track.clips.find((c) => c.id === clipId);
      if (found) return found;
    }
    return null;
  };

  const handleDeleteClip = (clipId: string) => {
    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: track.clips.filter((c) => c.id !== clipId),
      }))
    );
    if (selectedClipId === clipId) {
      setSelectedClipId(null);
      setActiveTab('assets');
    }
  };

  const handleSplit = () => {
    if (!selectedClipId) return;
    const clip = findClipAcrossTracks(selectedClipId);
    if (!clip) return;

    // Check if playhead is strictly inside the clip boundaries
    if (playhead > clip.timeStart && playhead < clip.timeEnd) {
      const cutPointDuration = playhead - clip.timeStart;
      const cutPointSource = clip.trimStart + cutPointDuration * clip.speed;

      const clip1Updates: Partial<Clip> = {
        timeEnd: playhead,
      };

      const clip2: Clip = {
        id: 'clip_' + Math.random().toString(36).substr(2, 9),
        assetId: clip.assetId,
        trackId: clip.trackId,
        timeStart: playhead,
        timeEnd: clip.timeEnd,
        trimStart: cutPointSource,
        trimEnd: clip.trimEnd,
        volume: clip.volume,
        speed: clip.speed,
        name: `${clip.name} (Part 2)`,
      };

      setTracks((prev) =>
        prev.map((track) => {
          if (track.id === clip.trackId) {
            const updatedClips = track.clips.map((c) => {
              if (c.id === clip.id) {
                return { ...c, ...clip1Updates, name: `${c.name} (Part 1)` };
              }
              return c;
            });
            return { ...track, clips: [...updatedClips, clip2] };
          }
          return track;
        })
      );
      setSelectedClipId(clip2.id);
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header glass">
        <div className="logo-section">
          <Film className="logo-icon" size={24} />
          <span className="logo-text">Gemini Editor</span>
          <span style={{ fontSize: '0.65rem', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--color-primary)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>v1.0</span>
        </div>
        <div className="header-controls">
          <button className="btn" style={{ padding: '6px 12px' }} onClick={() => alert('Project state saved to local storage!')}>
            <Save size={14} />
            Save Project
          </button>
          <button className="btn btn-primary" style={{ padding: '6px 12px' }} onClick={() => setIsExportOpen(true)}>
            Export Video
          </button>
        </div>
      </header>

      {/* Middle Workspace */}
      <div className="app-workspace">
        {/* Left Side Panel */}
        <aside className="side-panel glass">
          <div className="panel-tabs">
            <button
              className={`panel-tab ${activeTab === 'assets' ? 'active' : ''}`}
              onClick={() => setActiveTab('assets')}
            >
              <FolderOpen size={14} />
              Assets
            </button>
            <button
              className={`panel-tab ${activeTab === 'properties' ? 'active' : ''}`}
              onClick={() => setActiveTab('properties')}
              disabled={!selectedClipId}
            >
              <Settings size={14} />
              Inspector
            </button>
          </div>
          
          {activeTab === 'assets' ? (
            <AssetLibrary
              assets={assets}
              onAddAsset={handleAddAsset}
              onRemoveAsset={handleRemoveAsset}
              onAddToTimeline={handleAddToTimeline}
            />
          ) : (
            <ClipControls
              selectedClipId={selectedClipId}
              tracks={tracks}
              onUpdateClip={handleUpdateClip}
              onDeleteClip={handleDeleteClip}
            />
          )}
        </aside>

        {/* Center / Right Player Panel */}
        <PreviewPlayer
          isPlaying={isPlaying}
          playhead={playhead}
          duration={duration}
          tracks={tracks}
          selectedClipId={selectedClipId}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onSeek={setPlayhead}
          onSplit={handleSplit}
          mediaElements={mediaElementsMap}
        />
      </div>

      {/* Bottom Timeline */}
      <Timeline
        tracks={tracks}
        assets={assets}
        playhead={playhead}
        zoom={zoom}
        duration={duration}
        selectedClipId={selectedClipId}
        onSeek={setPlayhead}
        onUpdateZoom={setZoom}
        onUpdateClip={handleUpdateClip}
        onSelectClip={setSelectedClipId}
        onDeleteClip={handleDeleteClip}
        onSplit={handleSplit}
        onAddClipToTrack={handleAddNewClipToTrack}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        duration={duration}
        mediaElements={mediaElementsMap}
        onSeek={setPlayhead}
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        isPlaying={isPlaying}
      />
    </div>
  );
}

export default App;

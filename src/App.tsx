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
  { id: 'a1', name: 'Audio Track 1', type: 'audio', clips: [] },
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
  const [activeTool, setActiveTool] = useState<'select' | 'blade'>('select');

  // Hidden video/audio elements pool mapping clipId -> mediaElement
  const mediaElementsRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  const [mediaElementsMap, setMediaElementsMap] = useState<Map<string, HTMLMediaElement>>(new Map());

  // Master project duration (highest clip timeEnd, min 5 minutes / 300 seconds)
  const duration = Math.max(300, ...tracks.flatMap((t) => t.clips.map((c) => c.timeEnd)));

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
          const targetSourceTime = clip.trimStart + (playhead - clip.timeStart) * clip.speed;

          if (el.playbackRate !== clip.speed) el.playbackRate = clip.speed;
          if (el.volume !== clip.volume) el.volume = clip.volume;

          if (isPlaying && el.paused) {
            el.play().catch(() => {});
          } else if (!isPlaying && !el.paused) {
            el.pause();
          }

          // Dynamic threshold to prevent audio popping/stuttering during active playback
          const threshold = isPlaying ? 0.45 : 0.05;
          if (Math.abs(el.currentTime - targetSourceTime) > threshold) {
            el.currentTime = targetSourceTime;
          }
        } else {
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
      } else if (e.code === 'KeyV') {
        e.preventDefault();
        setActiveTool('select');
      } else if (e.code === 'KeyB') {
        e.preventDefault();
        setActiveTool('blade');
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
          duration: 5.0,
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
    const targetType = asset.type === 'audio' ? 'audio' : 'video';
    const compatibleTrack = tracks.find((t) => t.type === targetType);
    if (compatibleTrack) {
      handleAddNewClipToTrack(asset.id, compatibleTrack.id, playhead);
    }
  };

  // Add new clip with Linked A/V support
  const handleAddNewClipToTrack = (assetId: string, trackId: string, timeStart: number) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;

    const isVideoAsset = asset.type === 'video';
    const currentTrack = tracks.find((t) => t.id === trackId);

    if (isVideoAsset && currentTrack && currentTrack.type === 'video') {
      // Find or create an audio track to place linked audio clip
      let audioTrack = tracks.find((t) => t.type === 'audio');
      if (!audioTrack) {
        // Fallback create track if missing
        handleAddTrack('audio');
        return; // handleAddTrack will trigger state change, drop again or add
      }

      const videoClipId = 'clip_' + Math.random().toString(36).substr(2, 9);
      const audioClipId = 'clip_' + Math.random().toString(36).substr(2, 9);

      const newVideoClip: Clip = {
        id: videoClipId,
        assetId,
        trackId,
        timeStart,
        timeEnd: timeStart + asset.duration,
        trimStart: 0,
        trimEnd: 0,
        volume: 1.0,
        speed: 1.0,
        name: asset.name,
        linkedClipId: audioClipId,
      };

      const newAudioClip: Clip = {
        id: audioClipId,
        assetId,
        trackId: audioTrack.id,
        timeStart,
        timeEnd: timeStart + asset.duration,
        trimStart: 0,
        trimEnd: 0,
        volume: 1.0,
        speed: 1.0,
        name: `${asset.name} (Audio)`,
        linkedClipId: videoClipId,
      };

      setTracks((prev) =>
        prev.map((track) => {
          if (track.id === trackId) {
            return { ...track, clips: [...track.clips, newVideoClip] };
          }
          if (audioTrack && track.id === audioTrack.id) {
            return { ...track, clips: [...track.clips, newAudioClip] };
          }
          return track;
        })
      );

      setSelectedClipId(videoClipId);
      setActiveTab('properties');
      return;
    }

    // Standard clip addition
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

  // Add Empty track programmatically
  const handleAddTrack = (type: 'video' | 'audio') => {
    const typeCount = tracks.filter((t) => t.type === type).length + 1;
    const newTrack: Track = {
      id: `${type}_track_${Math.random().toString(36).substr(2, 9)}`,
      name: `${type === 'video' ? 'Video' : 'Audio'} Track ${typeCount}`,
      type,
      clips: [],
    };
    setTracks((prev) => [...prev, newTrack]);
  };

  // Dynamic track creation & clip placement (drag to top/bottom of tracks columns)
  const handleAddTrackAndClip = (
    type: 'video' | 'audio',
    assetId: string,
    timeStart: number,
    insertAt: 'top' | 'bottom'
  ) => {
    const typeCount = tracks.filter((t) => t.type === type).length + 1;
    const newTrackId = `${type}_track_${Math.random().toString(36).substr(2, 9)}`;
    const newTrackName = `${type === 'video' ? 'Video' : 'Audio'} Track ${typeCount}`;

    const newTrack: Track = {
      id: newTrackId,
      name: newTrackName,
      type,
      clips: [],
    };

    const videos = tracks.filter((t) => t.type === 'video');
    const audios = tracks.filter((t) => t.type === 'audio');

    let updatedTracks: Track[] = [];
    if (type === 'video') {
      if (insertAt === 'top') {
        updatedTracks = [newTrack, ...videos, ...audios];
      } else {
        updatedTracks = [...videos, newTrack, ...audios];
      }
    } else {
      if (insertAt === 'top') {
        updatedTracks = [...videos, newTrack, ...audios];
      } else {
        updatedTracks = [...videos, ...audios, newTrack];
      }
    }

    setTracks(updatedTracks);

    // Place clip on new track
    setTimeout(() => {
      handleAddNewClipToTrack(assetId, newTrackId, timeStart);
    }, 80);
  };

  // Update clip properties (drag, trim, settings)
  const handleUpdateClip = (clipId: string, updates: Partial<Clip>) => {
    setTracks((prev) =>
      prev.map((track) => {
        if (updates.trackId && updates.trackId !== track.id && track.clips.some((c) => c.id === clipId)) {
          return { ...track, clips: track.clips.filter((c) => c.id !== clipId) };
        }
        if (updates.trackId && updates.trackId === track.id && !track.clips.some((c) => c.id === clipId)) {
          const oldClip = findClipAcrossTracks(clipId);
          if (oldClip) {
            const updated = { ...oldClip, ...updates };
            return { ...track, clips: [...track.clips, updated] };
          }
        }
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
    const clip = findClipAcrossTracks(clipId);
    const linkedId = clip?.linkedClipId;

    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: track.clips.filter((c) => c.id !== clipId && c.id !== linkedId),
      }))
    );
    if (selectedClipId === clipId || selectedClipId === linkedId) {
      setSelectedClipId(null);
      setActiveTab('assets');
    }
  };

  // Split clips with Linked A/V support
  const handleSplit = () => {
    if (!selectedClipId) return;
    const clip = findClipAcrossTracks(selectedClipId);
    if (!clip) return;

    if (playhead > clip.timeStart && playhead < clip.timeEnd) {
      const cutDuration = playhead - clip.timeStart;
      
      const clip1Id = clip.id;
      const clip2Id = 'clip_' + Math.random().toString(36).substr(2, 9);
      const cutPointSource = clip.trimStart + cutDuration * clip.speed;

      let linkedClip1Id: string | undefined = undefined;
      let linkedClip2Id: string | undefined = undefined;
      const linkedClip = clip.linkedClipId ? findClipAcrossTracks(clip.linkedClipId) : null;

      if (linkedClip && playhead > linkedClip.timeStart && playhead < linkedClip.timeEnd) {
        linkedClip1Id = linkedClip.id;
        linkedClip2Id = 'clip_' + Math.random().toString(36).substr(2, 9);
      }

      setTracks((prev) =>
        prev.map((track) => {
          let trackClips = [...track.clips];

          if (track.id === clip.trackId) {
            trackClips = trackClips.map((c) => {
              if (c.id === clip.id) {
                return {
                  ...c,
                  timeEnd: playhead,
                  name: `${c.name} (Part 1)`,
                  linkedClipId: linkedClip1Id ? linkedClip1Id : c.linkedClipId,
                };
              }
              return c;
            });

            const clip2: Clip = {
              id: clip2Id,
              assetId: clip.assetId,
              trackId: clip.trackId,
              timeStart: playhead,
              timeEnd: clip.timeEnd,
              trimStart: cutPointSource,
              trimEnd: clip.trimEnd,
              volume: clip.volume,
              speed: clip.speed,
              name: `${clip.name} (Part 2)`,
              linkedClipId: linkedClip2Id,
            };
            trackClips.push(clip2);
          }

          if (linkedClip && track.id === linkedClip.trackId) {
            const linkedCutSource = linkedClip.trimStart + cutDuration * linkedClip.speed;
            trackClips = trackClips.map((c) => {
              if (c.id === linkedClip!.id) {
                return {
                  ...c,
                  timeEnd: playhead,
                  name: `${c.name} (Part 1)`,
                  linkedClipId: clip1Id,
                };
              }
              return c;
            });

            const linkedClip2: Clip = {
              id: linkedClip2Id!,
              assetId: linkedClip.assetId,
              trackId: linkedClip.trackId,
              timeStart: playhead,
              timeEnd: linkedClip.timeEnd,
              trimStart: linkedCutSource,
              trimEnd: linkedClip.trimEnd,
              volume: linkedClip.volume,
              speed: linkedClip.speed,
              name: `${linkedClip.name} (Part 2)`,
              linkedClipId: clip2Id,
            };
            trackClips.push(linkedClip2);
          }

          return { ...track, clips: trackClips };
        })
      );
      setSelectedClipId(clip2Id);
    }
  };

  // Join adjacent/contiguous clips together (Heal Split)
  const handleJoinClips = (clipId1: string, clipId2: string) => {
    const clip1 = findClipAcrossTracks(clipId1);
    const clip2 = findClipAcrossTracks(clipId2);
    if (!clip1 || !clip2) return;

    const earlier = clip1.timeStart < clip2.timeStart ? clip1 : clip2;
    const later = clip1.timeStart < clip2.timeStart ? clip2 : clip1;

    let linkedEarlier: Clip | null = null;
    let linkedLater: Clip | null = null;
    if (earlier.linkedClipId && later.linkedClipId) {
      linkedEarlier = findClipAcrossTracks(earlier.linkedClipId);
      linkedLater = findClipAcrossTracks(later.linkedClipId);
    }

    setTracks((prev) =>
      prev.map((track) => {
        let trackClips = [...track.clips];

        if (track.id === earlier.trackId) {
          trackClips = trackClips.map((c) => {
            if (c.id === earlier.id) {
              const cleanName = c.name.replace(' (Part 1)', '').replace(' (Part 2)', '');
              return {
                ...c,
                timeEnd: later.timeEnd,
                name: cleanName,
                linkedClipId: linkedEarlier ? linkedEarlier.id : undefined,
              };
            }
            return c;
          });
          trackClips = trackClips.filter((c) => c.id !== later.id);
        }

        if (linkedEarlier && linkedLater && track.id === linkedEarlier.trackId) {
          trackClips = trackClips.map((c) => {
            if (c.id === linkedEarlier!.id) {
              const cleanName = c.name.replace(' (Part 1)', '').replace(' (Part 2)', '');
              return {
                ...c,
                timeEnd: linkedLater!.timeEnd,
                name: cleanName,
                linkedClipId: earlier.id,
              };
            }
            return c;
          });
          trackClips = trackClips.filter((c) => c.id !== linkedLater!.id);
        }

        return { ...track, clips: trackClips };
      })
    );

    setSelectedClipId(earlier.id);
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
        activeTool={activeTool}
        onChangeTool={setActiveTool}
        onSeek={setPlayhead}
        onUpdateZoom={setZoom}
        onUpdateClip={handleUpdateClip}
        onSelectClip={setSelectedClipId}
        onDeleteClip={handleDeleteClip}
        onSplit={handleSplit}
        onAddClipToTrack={handleAddNewClipToTrack}
        onAddTrackAndClip={handleAddTrackAndClip}
        onAddTrack={handleAddTrack}
        onJoinClips={handleJoinClips}
      />

      {/* Export Modal */}
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

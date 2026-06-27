import React, { useState, useEffect, useRef } from 'react';
import { Download, Film, CheckCircle, RefreshCw, X, AlertTriangle } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import type { Track, Asset } from '../types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  duration: number;
  mediaElements: Map<string, HTMLMediaElement>;
  onTogglePlay: () => void;
  isPlaying: boolean;
  tracks: Track[];
  assets: Asset[];
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '4:5' | '21:9' | '2:3';
  masterVolume: number;
  isMuted: boolean;
}

const ASPECT_RATIO_PRESETS = [
  { value: '16:9', width: 1280, height: 720 },
  { value: '9:16', width: 720, height: 1280 },
  { value: '1:1', width: 1080, height: 1080 },
  { value: '4:3', width: 960, height: 720 },
  { value: '4:5', width: 864, height: 1080 },
  { value: '21:9', width: 1680, height: 720 },
  { value: '2:3', width: 720, height: 1080 },
];

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  duration,
  mediaElements,
  onTogglePlay,
  isPlaying,
  tracks,
  assets,
  aspectRatio,
  masterVolume,
  isMuted,
}) => {
  const [exportFormat, setExportFormat] = useState<string>('webm');
  const [exportResolution, setExportResolution] = useState<string>('720p');
  const [exportState, setExportState] = useState<'idle' | 'rendering' | 'transcoding' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const isCanceledRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      // Reset states on close
      setExportState('idle');
      setProgress(0);
      setStatusMessage('');
      isCanceledRef.current = true;
      if (outputUrl) {
        URL.revokeObjectURL(outputUrl);
        setOutputUrl(null);
      }
    } else {
      isCanceledRef.current = false;
    }
  }, [isOpen]);

  const loadFFmpeg = async (): Promise<FFmpeg> => {
    if (ffmpegRef.current) return ffmpegRef.current;

    setStatusMessage('Loading Transcoder engine...');
    const ffmpeg = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/octet-stream'),
    });

    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  // WAV Audio Encoder Helper (16-bit PCM WAV)
  const bufferToWav = (buffer: AudioBuffer): Blob => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;

    const setUint16 = (data: number) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };

    const setUint32 = (data: number) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // chunk length
    setUint16(1); // sample format (raw PCM)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
    setUint16(numOfChan * 2); // block align
    setUint16(16); // bits per sample
    setUint32(0x61746164); // "data" chunk
    setUint32(length - pos - 4); // chunk length

    for (i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff; // scale to 16-bit
        view.setInt16(pos, sample, true); // write sample
        pos += 2;
      }
      offset++;
    }

    return new Blob([bufferArr], { type: 'audio/wav' });
  };

  const handleStartExport = async () => {
    try {
      isCanceledRef.current = false;
      setProgress(0);
      setExportState('rendering');

      // Ensure playback is paused
      if (isPlaying) onTogglePlay();

      const ffmpeg = await loadFFmpeg();

      // Determine dimensions from selected Aspect Ratio preset
      const preset = ASPECT_RATIO_PRESETS.find((p) => p.value === aspectRatio) || ASPECT_RATIO_PRESETS[0];
      let renderW = preset.width;
      let renderH = preset.height;

      // Adjust resolution scale (SD vs HD vs Full HD)
      if (exportResolution === '480p') {
        const factor = 480 / renderH;
        renderW = Math.round((renderW * factor) / 2) * 2; // ensure even dimensions
        renderH = 480;
      } else if (exportResolution === '1080p') {
        const factor = 1080 / renderH;
        renderW = Math.round((renderW * factor) / 2) * 2;
        renderH = 1080;
      }

      // Create an offscreen render canvas
      const canvas = document.createElement('canvas');
      canvas.width = renderW;
      canvas.height = renderH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create offscreen 2D context.');

      // --- STEP 1: Offline Audio Mixing (using OfflineAudioContext) ---
      setStatusMessage('Decoding audio assets...');
      const decodedBuffers = new Map<string, AudioBuffer>();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const clipsWithAudio = tracks.flatMap((t) => t.clips).filter((c) => c.text === undefined);
      
      for (const clip of clipsWithAudio) {
        if (isCanceledRef.current) return;
        if (decodedBuffers.has(clip.assetId)) continue;
        
        const asset = assets.find((a) => a.id === clip.assetId);
        if (asset && asset.url) {
          try {
            const response = await fetch(asset.url);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = await audioCtx.decodeAudioData(arrayBuffer);
            decodedBuffers.set(clip.assetId, buffer);
          } catch (e) {
            console.warn(`Could not decode audio for asset ${asset.name}:`, e);
          }
        }
      }

      setStatusMessage('Mixing audio tracks...');
      // Build offline audio graph
      const offlineCtx = new OfflineAudioContext(2, Math.max(1, 44100 * duration), 44100);
      let hasAudioTracks = false;

      tracks.forEach((track) => {
        track.clips.forEach((clip) => {
          if (clip.text !== undefined) return;
          const buffer = decodedBuffers.get(clip.assetId);
          if (!buffer) return;

          hasAudioTracks = true;
          const source = offlineCtx.createBufferSource();
          source.buffer = buffer;
          source.playbackRate.value = clip.speed;

          const gainNode = offlineCtx.createGain();
          // Mix clip volume with master player volume
          gainNode.gain.value = isMuted ? 0 : clip.volume * masterVolume;

          source.connect(gainNode);
          gainNode.connect(offlineCtx.destination);

          const clipDuration = clip.timeEnd - clip.timeStart;
          source.start(clip.timeStart, clip.trimStart, clipDuration);
        });
      });

      if (hasAudioTracks) {
        const mixedBuffer = await offlineCtx.startRendering();
        const wavBlob = bufferToWav(mixedBuffer);
        await ffmpeg.writeFile('audio.wav', new Uint8Array(await wavBlob.arrayBuffer()));
      }

      // --- STEP 2: Frame-by-Frame Video Offline Rendering ---
      const fps = 30;
      const totalFrames = Math.max(1, Math.ceil(duration * fps));
      setStatusMessage('Rendering video frames offline...');

      for (let i = 0; i < totalFrames; i++) {
        if (isCanceledRef.current) return;

        const time = i / fps;
        
        // Seek active video elements to precise source positions
        const activeVideos: HTMLVideoElement[] = [];
        tracks.forEach((track) => {
          if (track.type !== 'video') return;
          track.clips.forEach((clip) => {
            if (clip.text !== undefined) return;
            if (time >= clip.timeStart && time <= clip.timeEnd) {
              const el = mediaElements.get(clip.id) as HTMLVideoElement;
              if (el) activeVideos.push(el);
            }
          });
        });

        // Trigger currentTime seeks on elements directly
        activeVideos.forEach((video) => {
          const clip = tracks.flatMap(t => t.clips).find(c => c.id === video.id);
          if (clip) {
            const targetSourceTime = clip.trimStart + (time - clip.timeStart) * clip.speed;
            video.currentTime = targetSourceTime;
          }
        });

        // Wait for all active elements to finish decoding and seeking
        await Promise.all(activeVideos.map((video) => {
          if (!video.seeking) return Promise.resolve();
          return new Promise<void>((resolve) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              resolve();
            };
            video.addEventListener('seeked', onSeeked);
            // Fallback timeout to prevent freezes on corrupted frames
            setTimeout(() => {
              video.removeEventListener('seeked', onSeeked);
              resolve();
            }, 100);
          });
        }));

        // Draw visual layers onto offscreen canvas (Bottom to Top)
        ctx.fillStyle = '#06070a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const videoTracks = tracks.filter((t) => t.type === 'video');

        for (let tIndex = videoTracks.length - 1; tIndex >= 0; tIndex--) {
          const track = videoTracks[tIndex];
          const activeClip = track.clips.find(
            (clip) => time >= clip.timeStart && time <= clip.timeEnd
          );

          if (activeClip) {
            ctx.save();

            const posX = activeClip.x ?? 0;
            const posY = activeClip.y ?? 0;
            const scale = activeClip.scale ?? 1.0;
            const rotation = activeClip.rotation ?? 0;
            const flipH = activeClip.flipH ?? false;
            const flipV = activeClip.flipV ?? false;
            const fitMode = activeClip.fitMode ?? 'fit';

            const cx = canvas.width / 2 + posX;
            const cy = canvas.height / 2 + posY;
            ctx.translate(cx, cy);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.scale(flipH ? -scale : scale, flipV ? -scale : scale);

            if (activeClip.text !== undefined) {
              ctx.fillStyle = activeClip.textColor || '#ffffff';
              const fSize = activeClip.fontSize || 48;
              ctx.font = `bold ${fSize}px Outfit, Inter, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(activeClip.text, 0, 0);
            } else {
              const el = mediaElements.get(activeClip.id);
              if (el) {
                const video = el as HTMLVideoElement;
                const sourceW = video.videoWidth || 640;
                const sourceH = video.videoHeight || 360;

                let w = sourceW;
                let h = sourceH;

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

                ctx.drawImage(video, -w / 2, -h / 2, w, h);
              }
            }

            ctx.restore();
          }
        }

        // Capture frame as JPEG and write to virtual filesystem
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
        if (blob) {
          const buffer = new Uint8Array(await blob.arrayBuffer());
          await ffmpeg.writeFile(`frame_${i}.jpg`, buffer);
        }

        // Update progress percentage
        setProgress(Math.round((i / totalFrames) * 90));
      }

      // --- STEP 3: Mux & Transcode via ffmpeg.wasm ---
      setExportState('transcoding');
      setProgress(92);
      setStatusMessage('Assembling frames and mixing output...');

      if (exportFormat === 'mp4') {
        if (hasAudioTracks) {
          await ffmpeg.exec([
            '-framerate', '30',
            '-i', 'frame_%d.jpg',
            '-i', 'audio.wav',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-shortest',
            'output.mp4'
          ]);
        } else {
          await ffmpeg.exec([
            '-framerate', '30',
            '-i', 'frame_%d.jpg',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-pix_fmt', 'yuv420p',
            'output.mp4'
          ]);
        }
        const data = (await ffmpeg.readFile('output.mp4')) as any;
        const mp4Blob = new Blob([data], { type: 'video/mp4' });
        setOutputUrl(URL.createObjectURL(mp4Blob));

      } else if (exportFormat === 'webm') {
        if (hasAudioTracks) {
          await ffmpeg.exec([
            '-framerate', '30',
            '-i', 'frame_%d.jpg',
            '-i', 'audio.wav',
            '-c:v', 'libvpx',
            '-b:v', '1M',
            '-c:a', 'libvorbis',
            'output.webm'
          ]);
        } else {
          await ffmpeg.exec([
            '-framerate', '30',
            '-i', 'frame_%d.jpg',
            '-c:v', 'libvpx',
            '-b:v', '1M',
            'output.webm'
          ]);
        }
        const data = (await ffmpeg.readFile('output.webm')) as any;
        const webmBlob = new Blob([data], { type: 'video/webm' });
        setOutputUrl(URL.createObjectURL(webmBlob));

      } else if (exportFormat === 'gif') {
        await ffmpeg.exec([
          '-framerate', '10',
          '-i', 'frame_%d.jpg',
          '-vf', 'scale=320:-1:flags=lanczos',
          '-c:v', 'gif',
          'output.gif'
        ]);
        const data = (await ffmpeg.readFile('output.gif')) as any;
        const gifBlob = new Blob([data], { type: 'image/gif' });
        setOutputUrl(URL.createObjectURL(gifBlob));

      } else if (exportFormat === 'mp3') {
        if (hasAudioTracks) {
          const data = (await ffmpeg.readFile('audio.wav')) as any;
          const mp3Blob = new Blob([data], { type: 'audio/wav' }); // wav output directly
          setOutputUrl(URL.createObjectURL(mp3Blob));
        } else {
          throw new Error('No audio tracks present to export as MP3.');
        }
      }

      // Cleanup frame files from FFmpeg memory
      for (let i = 0; i < totalFrames; i++) {
        try {
          await ffmpeg.deleteFile(`frame_${i}.jpg`);
        } catch (_) {}
      }
      if (hasAudioTracks) {
        try {
          await ffmpeg.deleteFile('audio.wav');
        } catch (_) {}
      }

      setProgress(100);
      setExportState('done');
      setStatusMessage('Export finished! Download below.');

    } catch (err: any) {
      console.error(err);
      setExportState('error');
      setStatusMessage(err.message || 'An error occurred during export.');
    }
  };

  const handleDownload = () => {
    if (!outputUrl) return;
    const a = document.createElement('a');
    a.href = outputUrl;
    const ext = exportFormat === 'mp3' ? 'wav' : exportFormat; // output wav if audio
    a.download = `my-editor-export.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content glass">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Film size={20} className="logo-icon" />
            <span>Fast Offline Render & Export</span>
          </div>
          <button className="btn btn-icon" onClick={onClose} style={{ width: '28px', height: '28px', padding: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {exportState === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p>Configure output options. All edits will be consolidated and rendered offline <b>frame-by-frame</b> at maximum CPU/GPU speed.</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Format</label>
                <select
                  className="input-select"
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                >
                  <option value="mp4">MP4 (Universal Compatibility)</option>
                  <option value="webm">WebM (Fast & High Quality)</option>
                  <option value="gif">GIF (Animated, Short Loop)</option>
                  <option value="mp3">Audio Track Only (WAV format)</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Resolution</label>
                <select
                  className="input-select"
                  value={exportResolution}
                  onChange={(e) => setExportResolution(e.target.value)}
                  disabled={exportFormat === 'mp3'}
                >
                  <option value="480p">480p (Mobile SD)</option>
                  <option value="720p">720p (HD - Recommended)</option>
                  <option value="1080p">1080p (Full HD)</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.2)', fontSize: '0.75rem', color: 'var(--color-primary)' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>Render executes silently in the background. Your speakers will remain quiet during export.</span>
              </div>
            </div>
          )}

          {(exportState === 'rendering' || exportState === 'transcoding') && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: '16px' }}>
              <RefreshCw className="logo-icon" style={{ animation: 'spin 2s linear infinite' }} size={32} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontWeight: 600, color: 'var(--text-main)' }}>{statusMessage}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Please do not close this window.</p>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: 'var(--color-primary)', transition: 'width 0.2s ease' }} />
              </div>
              <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{progress}%</span>
            </div>
          )}

          {exportState === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: '16px' }}>
              <CheckCircle size={40} style={{ color: 'var(--color-success)' }} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontWeight: 600, color: 'var(--text-main)' }}>Export Successful!</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Your video is ready to download.</p>
              </div>
              <button
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '8px' }}
                onClick={handleDownload}
              >
                <Download size={16} />
                Download File
              </button>
            </div>
          )}

          {exportState === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: '16px' }}>
              <AlertTriangle size={40} style={{ color: 'var(--color-accent)' }} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontWeight: 600, color: 'var(--text-main)' }}>Export Failed</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{statusMessage}</p>
              </div>
              <button
                className="btn btn-accent"
                style={{ width: '100%', marginTop: '8px' }}
                onClick={() => setExportState('idle')}
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {exportState === 'idle' && (
            <>
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleStartExport}>
                <Film size={14} />
                Start Export
              </button>
            </>
          )}
          {exportState === 'done' && (
            <button className="btn" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

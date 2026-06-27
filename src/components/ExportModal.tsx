import React, { useState, useEffect, useRef } from 'react';
import { Download, Film, CheckCircle, RefreshCw, X, AlertTriangle } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  duration: number;
  mediaElements: Map<string, HTMLMediaElement>;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  isPlaying: boolean;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  duration,
  mediaElements,
  onSeek,
  onTogglePlay,
  isPlaying,
}) => {
  const [exportFormat, setExportFormat] = useState<string>('webm');
  const [exportResolution, setExportResolution] = useState<string>('720p');
  const [exportState, setExportState] = useState<'idle' | 'recording' | 'transcoding' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!isOpen) {
      // Reset states on close
      setExportState('idle');
      setProgress(0);
      setStatusMessage('');
      if (outputUrl) {
        URL.revokeObjectURL(outputUrl);
        setOutputUrl(null);
      }
    }
  }, [isOpen]);

  const loadFFmpeg = async (): Promise<FFmpeg> => {
    if (ffmpegRef.current) return ffmpegRef.current;

    setStatusMessage('Loading Transcoder engine...');
    const ffmpeg = new FFmpeg();
    
    // Core files loaded from CDN for lightweight setup
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/octet-stream'),
    });

    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  const handleStartExport = async () => {
    try {
      recordedChunksRef.current = [];
      setProgress(0);
      setExportState('recording');
      setStatusMessage('Recording project in real-time...');

      // Find the main preview canvas
      const previewCanvas = document.querySelector('.main-preview-canvas') as HTMLCanvasElement;
      if (!previewCanvas) {
        throw new Error('Preview canvas not found.');
      }

      // Seek to 0 and ensure we are paused before starting
      if (isPlaying) onTogglePlay();
      onSeek(0);

      // Give a brief moment to seek
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Setup Canvas Capture Stream
      const canvasStream = previewCanvas.captureStream(30); // 30 fps

      // Setup AudioContext for mixing active tracks
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const dest = audioCtx.createMediaStreamDestination();

      const sourceNodes: any[] = [];
      
      // Connect all media elements to the AudioContext Destination
      mediaElements.forEach((element) => {
        try {
          const source = audioCtx.createMediaElementSource(element);
          source.connect(dest);
          source.connect(audioCtx.destination); // Route to output speakers as well
          sourceNodes.push(source);
        } catch (e) {
          // MediaElementAudioSourceNode can only be created once per element.
          // If we run into an error, it is already connected, or we fallback.
        }
      });

      // Combine video and audio tracks
      const combinedStream = new MediaStream();
      canvasStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track));
      dest.stream.getAudioTracks().forEach((track) => combinedStream.addTrack(track));

      // MediaRecorder configuration
      let options = { mimeType: 'video/webm;codecs=vp9,opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
      }

      const mediaRecorder = new MediaRecorder(combinedStream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const rawWebmBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        
        if (exportFormat === 'webm') {
          const url = URL.createObjectURL(rawWebmBlob);
          setOutputUrl(url);
          setExportState('done');
          setStatusMessage('Export completed successfully!');
        } else {
          // Transcode via ffmpeg.wasm
          await runTranscode(rawWebmBlob);
        }
      };

      // Start playhead playback
      onTogglePlay();
      mediaRecorder.start();

      // Track progress
      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const percent = Math.min(100, Math.round((elapsed / duration) * 100));
        setProgress(percent);

        if (elapsed >= duration) {
          clearInterval(interval);
          if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }
          // Pause playback
          onTogglePlay();
        }
      }, 250);

    } catch (err: any) {
      console.error(err);
      setExportState('error');
      setStatusMessage(err.message || 'An error occurred during export.');
    }
  };

  const runTranscode = async (rawBlob: Blob) => {
    try {
      setExportState('transcoding');
      setProgress(50);
      setStatusMessage(`Transcoding to ${exportFormat.toUpperCase()} format...`);

      const ffmpeg = await loadFFmpeg();
      
      // Write the input WebM file
      await ffmpeg.writeFile('input.webm', await fetchFile(rawBlob));

      setProgress(75);
      
      if (exportFormat === 'mp4') {
        setStatusMessage('Converting container to MP4...');
        // Convert webm to mp4 using fast copy (since Chrome exports H.264/VP9)
        // Or transcode for universal compatibility
        await ffmpeg.exec(['-i', 'input.webm', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', 'output.mp4']);
        const data = (await ffmpeg.readFile('output.mp4')) as any;
        const mp4Blob = new Blob([data], { type: 'video/mp4' });
        setOutputUrl(URL.createObjectURL(mp4Blob));
      } else if (exportFormat === 'gif') {
        setStatusMessage('Generating animated GIF...');
        await ffmpeg.exec(['-i', 'input.webm', '-vf', 'fps=10,scale=320:-1:flags=lanczos', '-c:v', 'gif', 'output.gif']);
        const data = (await ffmpeg.readFile('output.gif')) as any;
        const gifBlob = new Blob([data], { type: 'image/gif' });
        setOutputUrl(URL.createObjectURL(gifBlob));
      } else if (exportFormat === 'mp3') {
        setStatusMessage('Extracting MP3 Audio...');
        await ffmpeg.exec(['-i', 'input.webm', '-vn', '-c:a', 'libmp3lame', '-q:a', '4', 'output.mp3']);
        const data = (await ffmpeg.readFile('output.mp3')) as any;
        const mp3Blob = new Blob([data], { type: 'audio/mp3' });
        setOutputUrl(URL.createObjectURL(mp3Blob));
      }

      setProgress(100);
      setExportState('done');
      setStatusMessage('Transcoding finished!');
    } catch (err: any) {
      console.error(err);
      setExportState('error');
      setStatusMessage('Transcoding failed. Downloading raw WebM instead.');
      // Fallback
      const fallbackUrl = URL.createObjectURL(rawBlob);
      setOutputUrl(fallbackUrl);
      setExportState('done');
    }
  };

  const handleDownload = () => {
    if (!outputUrl) return;
    const a = document.createElement('a');
    a.href = outputUrl;
    a.download = `my-editor-export.${exportFormat}`;
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
            <span>Export & Save Composition</span>
          </div>
          <button className="btn btn-icon" onClick={onClose} style={{ width: '28px', height: '28px', padding: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {exportState === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p>Configure output options. All edits will be consolidated and processed client-side.</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Format</label>
                <select
                  className="input-select"
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                >
                  <option value="webm">WebM (Fastest, High Quality)</option>
                  <option value="mp4">MP4 (Universal Compatibility)</option>
                  <option value="gif">GIF (Animated, Short loop)</option>
                  <option value="mp3">MP3 (Audio Only)</option>
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

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(245, 158, 11, 0.08)', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.2)', fontSize: '0.75rem', color: 'var(--color-warning)' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>MP4, GIF and MP3 export requires a quick WebAssembly transcode phase after recording.</span>
              </div>
            </div>
          )}

          {(exportState === 'recording' || exportState === 'transcoding') && (
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

export interface Asset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  url: string; // Object URL
  duration: number; // in seconds
  width?: number; // for video/image
  height?: number; // for video/image
  file: File;
}

export interface Clip {
  id: string;
  assetId: string;
  trackId: string;
  timeStart: number; // Start time on the timeline (seconds)
  timeEnd: number; // End time on the timeline (seconds)
  trimStart: number; // Start offset within the source asset (seconds)
  trimEnd: number; // End offset within the source asset (seconds)
  volume: number; // 0.0 to 1.0
  speed: number; // Playback speed multiplier (e.g., 1.0)
  name: string;
  linkedClipId?: string; // Links video and audio clips together
}

export interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio';
  clips: Clip[];
}

export interface EditorState {
  assets: Asset[];
  tracks: Track[];
  playhead: number; // Current playback time (seconds)
  zoom: number; // Pixels per second (e.g., 20 to 200)
  isPlaying: boolean;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  duration: number; // Total length of the project timeline (seconds)
}

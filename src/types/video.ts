export interface VideoItem {
  id: string;
  title: string;
  uri: string;
  duration: number;
  thumbnail?: string;
  subtitles?: SubtitleTrack[];
  size?: number;    // file size in bytes
  mtime?: number;   // modification time as Unix ms timestamp
}

export interface SubtitleTrack {
  language: string;
  type: 'srt' | 'vtt' | 'ttml';
  uri: string;
}

export interface PlaylistItem {
  id: string;
  title: string;
  videos: VideoItem[];
}

export interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isFullscreen: boolean;
  selectedSubtitle: SubtitleTrack | null;
  playbackRate: number;
}

export interface AudioCodecInfo {
  codec: string;
  supported: boolean;
  bitrate?: string;
}

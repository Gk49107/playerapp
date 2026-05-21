import { AudioCodecInfo } from '../types/video';

// Supported audio codecs with EAC3 as primary
export const SUPPORTED_AUDIO_CODECS: Record<string, AudioCodecInfo> = {
  eac3: {
    codec: 'EAC3',
    supported: true,
    bitrate: '640 Kbps - 5.1 Mbps',
  },
  ac3: {
    codec: 'AC3',
    supported: true,
    bitrate: '192 - 640 Kbps',
  },
  aac: {
    codec: 'AAC',
    supported: true,
    bitrate: '128 - 320 Kbps',
  },
  mp3: {
    codec: 'MP3',
    supported: true,
    bitrate: '128 - 320 Kbps',
  },
  flac: {
    codec: 'FLAC',
    supported: true,
    bitrate: 'Lossless',
  },
  opus: {
    codec: 'Opus',
    supported: true,
    bitrate: '6 - 510 Kbps',
  },
};

// Format time in seconds to HH:MM:SS
export const formatTime = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return '00:00:00';
  
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return [
    hrs.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0'),
  ].join(':');
};

// Get video file extension
export const getVideoExtension = (uri: string): string => {
  try {
    const path = new URL(uri).pathname;
    return path.substring(path.lastIndexOf('.') + 1).toLowerCase();
  } catch {
    return uri.substring(uri.lastIndexOf('.') + 1).toLowerCase();
  }
};

// Detect audio codec from file extension or MIME type
export const detectAudioCodec = (filename: string): string | null => {
  const extension = filename.split('.').pop()?.toLowerCase();
  
  const codecMap: Record<string, string> = {
    'eac3': 'eac3',
    'ec3': 'eac3',
    'ac3': 'ac3',
    'aac': 'aac',
    'm4a': 'aac',
    'mp3': 'mp3',
    'flac': 'flac',
    'opus': 'opus',
    'ogg': 'opus',
    'webm': 'opus',
  };
  
  return extension ? codecMap[extension] || null : null;
};

// Validate if codec is supported
export const isCodecSupported = (codec: string): boolean => {
  const normalized = codec.toLowerCase();
  return SUPPORTED_AUDIO_CODECS[normalized]?.supported ?? false;
};

// Parse subtitle file from URI
export const parseSubtitleUri = (uri: string): { type: 'srt' | 'vtt' | 'ttml'; uri: string } | null => {
  const extension = uri.split('.').pop()?.toLowerCase();
  
  if (extension === 'srt') {
    return { type: 'srt', uri };
  } else if (extension === 'vtt') {
    return { type: 'vtt', uri };
  } else if (extension === 'ttml' || extension === 'xml') {
    return { type: 'ttml', uri };
  }
  
  return null;
};

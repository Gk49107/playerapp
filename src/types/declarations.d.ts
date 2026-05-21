declare module 'react-native-video' {
  import { Component } from 'react';
  import { ViewProps } from 'react-native';

  export interface VideoProperties extends ViewProps {
    source: { uri: string } | number;
    style?: any;
    controls?: boolean;
    playing?: boolean;
    volume?: number;
    rate?: number;
    onLoadStart?: () => void;
    onLoad?: (data: { duration: number }) => void;
    onError?: (error: any) => void;
    onProgress?: (data: { currentTime: number }) => void;
    onEnd?: () => void;
    subtitleStyle?: any;
    textTracks?: Array<{
      title: string;
      language: string;
      type: string;
      uri: string;
    }>;
  }

  export default class Video extends Component<VideoProperties> {
    seek(time: number): void;
  }
}

declare module 'react-native-create-thumbnail' {
  interface ThumbnailConfig {
    url: string;
    timeStamp?: number;
    format?: 'jpeg' | 'png';
    maxWidth?: number;
    dirSize?: number;
    headers?: Record<string, string>;
  }
  interface ThumbnailResponse {
    path: string;
    width: number;
    height: number;
    mime: string;
  }
  export function createThumbnail(config: ThumbnailConfig): Promise<ThumbnailResponse>;
}

declare module 'react-native-orientation-locker' {
  export default class OrientationLocker {
    static lockToLandscape(): void;
    static unlockAllOrientations(): void;
  }
}

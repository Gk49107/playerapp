import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
  TextInput,
  Image,
  BackHandler,
  Linking,
  ToastAndroid,
  Modal,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { formatTime } from '../utils/videoUtils';
import { createThumbnail } from 'react-native-create-thumbnail';
import VideoPlayer from '../components/VideoPlayer';
import { VideoItem } from '../types/video';

const VIDEO_EXTENSIONS = /\.(mp4|mkv|avi|mov|flv|webm|3gp|wmv|m4v|ts|m2ts)$/i;

interface FolderItem {
  id: string;
  name: string;
  path: string;
  videos: VideoItem[];
}

// ── Lazy thumbnail (shows placeholder until thumbnail generates) ─────────────
const Thumb: React.FC<{ uri: string; style: any; icon?: string }> = ({
  uri,
  style,
  icon = '▶',
}) => {
  const [thumbPath, setThumbPath] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    createThumbnail({ url: uri, timeStamp: 1000 })
      .then(res => { if (!cancelled) setThumbPath(res.path); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [uri]);

  if (thumbPath) {
    return (
      <Image source={{ uri: 'file://' + thumbPath }} style={style} resizeMode="cover" />
    );
  }
  return (
    <View style={[style, styles.thumbPlaceholder]}>
      <Text style={styles.thumbIcon}>{icon}</Text>
    </View>
  );
};

const CRASH_LOG_PATH = RNFS.DocumentDirectoryPath + '/crash_log.txt';

const HomeScreen: React.FC = () => {
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [videoFiles, setVideoFiles] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentFolder, setCurrentFolder] = useState<FolderItem | null>(null);
  const [activeTab, setActiveTab] = useState<'folders' | 'videos'>('folders');
  const [resumeMap, setResumeMap] = useState<Record<string, { pos: number; dur: number; ts: number }>>({}); 
  const [crashLog, setCrashLog] = useState<string | null>(null);
  const [showCrashModal, setShowCrashModal] = useState(false);

  // ── Check for crash log from previous session ──────────────────────
  useEffect(() => {
    RNFS.exists(CRASH_LOG_PATH)
      .then(exists => { if (exists) return RNFS.readFile(CRASH_LOG_PATH, 'utf8'); })
      .then(content => { if (content) setCrashLog(content); })
      .catch(() => {});
  }, []);

  const clearCrashLog = () => {
    RNFS.unlink(CRASH_LOG_PATH).catch(() => {});
    setCrashLog(null);
    setShowCrashModal(false);
  };;

  // Load all saved resume positions
  const loadResumeMap = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const resumeKeys = keys.filter(k => k.startsWith('vp_resume:'));
      if (resumeKeys.length === 0) return;
      const pairs = await AsyncStorage.multiGet(resumeKeys);
      const map: Record<string, { pos: number; dur: number; ts: number }> = {};
      for (const [key, val] of pairs) {
        if (val) {
          const uri = key.replace('vp_resume:', '');
          map[uri] = JSON.parse(val);
        }
      }
      setResumeMap(map);
    } catch {}
  }, []);

  // Refresh resume data whenever we return to the list
  useEffect(() => {
    if (!selectedVideo) loadResumeMap();
  }, [selectedVideo, loadResumeMap]);

  // ── Handle "Open with" / external video URI ──────────────────────────
  const openExternalUri = useCallback((uri: string | null) => {
    if (!uri) return;
    const isVideo = VIDEO_EXTENSIONS.test(uri) || uri.startsWith('content://') || uri.startsWith('file://');
    if (!isVideo) return;
    const title = uri.split('/').pop()?.split('?')[0] ?? 'Video';
    setSelectedVideo({
      id: `ext_${uri}`,
      title,
      uri,
      duration: 0,
    });
  }, []);

  useEffect(() => {
    // App launched via "Open with"
    Linking.getInitialURL().then(openExternalUri).catch(() => {});
    // App already open, another video opened via "Open with"
    const sub = Linking.addEventListener('url', ({ url }) => openExternalUri(url));
    return () => sub.remove();
  }, [openExternalUri]);

  // ── Hardware back button: navigate within app, double-tap root to exit ──
  useEffect(() => {
    let lastBack = 0;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (currentFolder) { setCurrentFolder(null); setSearchQuery(''); return true; }
      const now = Date.now();
      if (now - lastBack < 2000) {
        BackHandler.exitApp();
        return true;
      }
      lastBack = now;
      ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      return true;
    });
    return () => sub.remove();
  }, [currentFolder]);

  // ── Group videos by parent folder ──────────────────────────────────────
  const folders = useMemo<FolderItem[]>(() => {
    const map = new Map<string, VideoItem[]>();
    for (const v of videoFiles) {
      const rawPath = v.uri.replace('file://', '');
      const lastSlash = rawPath.lastIndexOf('/');
      const parentPath = lastSlash > 0 ? rawPath.substring(0, lastSlash) : rawPath;
      if (!map.has(parentPath)) map.set(parentPath, []);
      map.get(parentPath)!.push(v);
    }
    return Array.from(map.entries())
      .map(([path, videos], i) => ({
        id: `folder_${i}_${path}`,
        name: path.split('/').pop() || path,
        path,
        videos,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [videoFiles]);

  // ── Videos for current folder (with optional search filter) ───────────
  const folderVideos = useMemo<VideoItem[]>(() => {
    const src = currentFolder ? currentFolder.videos : [];
    if (!searchQuery.trim()) return src;
    const q = searchQuery.toLowerCase();
    return src.filter(v => v.title.toLowerCase().includes(q));
  }, [currentFolder, searchQuery]);

  // ── All videos (flat) with optional search filter ─────────────────────
  const allVideosFiltered = useMemo<VideoItem[]>(() => {
    if (!searchQuery.trim()) return videoFiles;
    const q = searchQuery.toLowerCase();
    return videoFiles.filter(v => v.title.toLowerCase().includes(q));
  }, [videoFiles, searchQuery]);

  // ── Folders with optional search filter ──────────────────────────────
  const foldersFiltered = useMemo<FolderItem[]>(() => {
    if (!searchQuery.trim()) return folders;
    const q = searchQuery.toLowerCase();
    return folders.filter(f => f.name.toLowerCase().includes(q) || f.videos.some(v => v.title.toLowerCase().includes(q)));
  }, [folders, searchQuery]);

  useEffect(() => {
    requestPermissionAndScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestPermissionAndScan = async () => {
    if (Platform.OS !== 'android') { scanVideos(); return; }
    try {
      const permission =
        Platform.Version >= 33
          ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO
          : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
      const result = await PermissionsAndroid.request(permission, {
        title: 'Storage Permission',
        message: 'Allow access to storage to show your videos',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      });
      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        scanVideos();
      } else {
        setPermissionDenied(true);
      }
    } catch (err) {
      console.warn(err);
    }
  };

  const scanDir = async (dirPath: string, depth: number, found: VideoItem[]) => {
    if (depth < 0) return;
    try {
      const items = await RNFS.readDir(dirPath);
      for (const item of items) {
        if (item.isFile() && VIDEO_EXTENSIONS.test(item.name)) {
          found.push({
            id: `video_${found.length}_${item.path}`,
            title: item.name,
            uri: `file://${item.path}`,
            duration: 0,
            subtitles: [],
          });
        } else if (item.isDirectory() && depth > 0) {
          await scanDir(item.path, depth - 1, found);
        }
      }
    } catch { /* skip inaccessible */ }
  };

  const scanVideos = useCallback(async () => {
    setLoading(true);
    setVideoFiles([]);
    setCurrentFolder(null);
    setSearchQuery('');
    const found: VideoItem[] = [];
    const rootDirs = [
      RNFS.ExternalStorageDirectoryPath,
      `${RNFS.ExternalStorageDirectoryPath}/Movies`,
      `${RNFS.ExternalStorageDirectoryPath}/Videos`,
      `${RNFS.ExternalStorageDirectoryPath}/Video`,
      `${RNFS.ExternalStorageDirectoryPath}/DCIM`,
      `${RNFS.ExternalStorageDirectoryPath}/Download`,
      `${RNFS.ExternalStorageDirectoryPath}/Downloads`,
      `${RNFS.ExternalStorageDirectoryPath}/WhatsApp/Media/WhatsApp Video`,
      `${RNFS.ExternalStorageDirectoryPath}/Telegram/Telegram Video`,
    ];
    for (const dir of rootDirs) {
      await scanDir(dir, 2, found);
    }
    const unique = Array.from(new Map(found.map(v => [v.uri, v])).values());
    setVideoFiles(unique);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Folder row ─────────────────────────────────────────────────────────
  const renderFolderItem = ({ item }: { item: FolderItem }) => (
    <TouchableOpacity
      style={styles.folderRow}
      onPress={() => { setCurrentFolder(item); setSearchQuery(''); }}
    >
      <View style={styles.folderThumbWrap}>
        <Thumb uri={item.videos[0]?.uri ?? ''} style={styles.folderThumb} icon="📁" />
        <View style={styles.folderBadge}>
          <Text style={styles.folderBadgeText}>{item.videos.length}</Text>
        </View>
      </View>
      <View style={styles.folderInfo}>
        <Text style={styles.folderName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.folderSub}>
          {item.videos.length} video{item.videos.length !== 1 ? 's' : ''}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  // ── Video row ──────────────────────────────────────────────────────────
  const renderVideoItem = ({ item }: { item: VideoItem }) => {
    const saved = resumeMap[item.uri];
    const pct = saved && saved.dur > 0 ? saved.pos / saved.dur : 0;
    const resumeLabel = saved
      ? `Resume ${formatTime(Math.round(saved.pos))}`
      : null;
    return (
      <TouchableOpacity style={styles.videoRow} onPress={() => setSelectedVideo(item)}>
        <View style={styles.thumbWrap}>
          <Thumb uri={item.uri} style={styles.thumbImg} />
          {pct > 0 && (
            <View style={styles.resumeBar}>
              <View style={[styles.resumeBarFill, { width: `${Math.round(pct * 100)}%` as any }]} />
            </View>
          )}
        </View>
        <View style={styles.videoInfo}>
          <Text style={styles.videoName} numberOfLines={2}>
            {item.title.replace(/\.[^.]+$/, '')}
          </Text>
          {resumeLabel && (
            <Text style={styles.resumeLabel}>{resumeLabel}</Text>
          )}
        </View>
        <Text style={styles.playArrow}>▶</Text>
      </TouchableOpacity>
    );
  };

  // ── Video player full-screen ───────────────────────────────────────────
  if (selectedVideo) {
    return <VideoPlayer video={selectedVideo} onBack={() => setSelectedVideo(null)} />;
  }

  const inFolder = currentFolder !== null;
  const isSearching = searchQuery.trim() !== '';

  // When inside a folder, always show video list
  const listData: any[] = inFolder
    ? folderVideos
    : activeTab === 'folders'
      ? foldersFiltered
      : allVideosFiltered;

  const countLabel = inFolder
    ? `${folderVideos.length} video${folderVideos.length !== 1 ? 's' : ''}${isSearching ? ` matching "${searchQuery}"` : ''}`
    : activeTab === 'folders'
      ? `${foldersFiltered.length} folder${foldersFiltered.length !== 1 ? 's' : ''}`
      : `${allVideosFiltered.length} video${allVideosFiltered.length !== 1 ? 's' : ''}`;

  return (
    <View style={styles.container}>

      {/* ── Crash log modal ── */}
      <Modal visible={showCrashModal} transparent animationType="fade" onRequestClose={() => setShowCrashModal(false)}>
        <View style={styles.crashModalOverlay}>
          <View style={styles.crashModalBox}>
            <Text style={styles.crashModalTitle}>Crash Log</Text>
            <ScrollView style={styles.crashModalScroll}>
              <Text style={styles.crashModalText} selectable>{crashLog ?? ''}</Text>
            </ScrollView>
            <View style={styles.crashModalButtons}>
              <TouchableOpacity onPress={clearCrashLog} style={styles.crashModalClearBtn}>
                <Text style={styles.crashModalClearBtnText}>Clear &amp; Close</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowCrashModal(false)} style={styles.crashModalCloseBtn}>
                <Text style={styles.crashModalCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Header ── */}
      <View style={styles.header}>
        {inFolder && (
          <TouchableOpacity
            onPress={() => { setCurrentFolder(null); setSearchQuery(''); }}
            style={styles.backBtn}
          >
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.headerTitle, inFolder && { flex: 1 }]} numberOfLines={1}>
          {inFolder ? currentFolder!.name : 'Videos'}
        </Text>
        {crashLog && (
          <TouchableOpacity onPress={() => setShowCrashModal(true)} style={styles.debugBtn}>
            <Text style={styles.debugBtnText}>🐛</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={scanVideos} style={styles.refreshBtn}>
          <Text style={styles.refreshBtnText}>{inFolder ? '⟳' : '⟳ Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab bar (only on root, not inside a folder) ── */}
      {!inFolder && (
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'folders' && styles.tabBtnActive]}
            onPress={() => { setActiveTab('folders'); setSearchQuery(''); }}
          >
            <Text style={[styles.tabBtnText, activeTab === 'folders' && styles.tabBtnTextActive]}>📁  Folders</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'videos' && styles.tabBtnActive]}
            onPress={() => { setActiveTab('videos'); setSearchQuery(''); }}
          >
            <Text style={[styles.tabBtnText, activeTab === 'videos' && styles.tabBtnTextActive]}>🎬  All Videos</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Search bar ── */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={
            inFolder
              ? `Search in ${currentFolder?.name ?? ''}…`
              : activeTab === 'folders'
                ? 'Search folders…'
                : 'Search videos…'
          }
          placeholderTextColor="#666"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {isSearching && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Loading ── */}
      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#FF6B35" />
          <Text style={styles.statusText}>Scanning videos…</Text>
        </View>
      )}

      {/* ── Permission denied ── */}
      {!loading && permissionDenied && (
        <View style={styles.centered}>
          <Text style={styles.statusText}>Storage permission denied.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={requestPermissionAndScan}>
            <Text style={styles.retryBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── No videos ── */}
      {!loading && !permissionDenied && videoFiles.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.statusText}>No videos found on device.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={scanVideos}>
            <Text style={styles.retryBtnText}>Scan Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── List ── */}
      {!loading && videoFiles.length > 0 && (
        <FlatList
          data={listData}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item }: any) =>
            (inFolder || activeTab === 'videos') ? renderVideoItem({ item }) : renderFolderItem({ item })
          }
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.countText}>{countLabel}</Text>
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.statusText}>No results for "{searchQuery}"</Text>
            </View>
          }
        />
      )}

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#FF6B35',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginRight: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  backBtnText: {
    color: '#fff',
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '300',
  },
  refreshBtn: {
    marginLeft: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FF6B35',
    borderRadius: 6,
  },
  refreshBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  debugBtn: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#cc0000',
    borderRadius: 6,
  },
  debugBtnText: {
    fontSize: 16,
  },

  // ── Crash modal ─────────────────────────────────────────────────────────
  crashModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  crashModalBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 16,
    width: '100%',
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#cc0000',
  },
  crashModalTitle: {
    color: '#ff4444',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 10,
  },
  crashModalScroll: {
    maxHeight: 400,
  },
  crashModalText: {
    color: '#eee',
    fontFamily: 'monospace',
    fontSize: 10,
  },
  crashModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 8,
  },
  crashModalClearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#cc0000',
    borderRadius: 6,
  },
  crashModalClearBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  crashModalCloseBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#444',
    borderRadius: 6,
  },
  crashModalCloseBtnText: {
    color: '#fff',
    fontSize: 13,
  },

  // ── Search ───────────────────────────────────────────────────────────────
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#444',
  },
  clearBtn: {
    marginLeft: 8,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    borderRadius: 14,
  },
  clearBtnText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // ── List ─────────────────────────────────────────────────────────────────
  list: {
    padding: 10,
  },
  countText: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
    marginLeft: 4,
  },

  // ── Folder row ───────────────────────────────────────────────────────────
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    marginBottom: 8,
    padding: 10,
  },
  folderThumbWrap: {
    position: 'relative',
    marginRight: 12,
  },
  folderThumb: {
    width: 72,
    height: 54,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
  },
  folderBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  folderBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  folderInfo: {
    flex: 1,
  },
  folderName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 3,
  },
  folderSub: {
    color: '#888',
    fontSize: 12,
  },
  chevron: {
    color: '#555',
    fontSize: 24,
    marginLeft: 6,
  },

  // ── Video row ────────────────────────────────────────────────────────────
  videoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    marginBottom: 8,
    padding: 8,
  },
  thumbWrap: {
    marginRight: 10,
  },
  thumbImg: {
    width: 80,
    height: 52,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
  },
  resumeBar: {
    height: 3,
    backgroundColor: '#333',
    borderRadius: 2,
    marginTop: 3,
    overflow: 'hidden',
  },
  resumeBarFill: {
    height: 3,
    backgroundColor: '#FF6B35',
    borderRadius: 2,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a2a2a',
  },
  thumbIcon: {
    color: '#FF6B35',
    fontSize: 18,
  },
  videoInfo: {
    flex: 1,
  },
  videoName: {
    color: '#eee',
    fontSize: 13,
    lineHeight: 18,
  },
  resumeLabel: {
    color: '#FF6B35',
    fontSize: 11,
    marginTop: 3,
  },
  playArrow: {
    color: '#FF6B35',
    fontSize: 14,
    marginLeft: 6,
  },

  // ── States ───────────────────────────────────────────────────────────────
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  statusText: {
    color: '#aaa',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },

  // ── Tab bar ──────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#FF6B35',
  },
  tabBtnText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#FF6B35',
  },
});

export default HomeScreen;
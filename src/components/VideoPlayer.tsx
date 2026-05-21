import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StatusBar,
  Animated,
  PanResponder,
  Dimensions,
  NativeModules,
  DeviceEventEmitter,
  Platform,
  PermissionsAndroid,
  BackHandler,
  AppState,
  Modal,
  FlatList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import VideoBase from 'react-native-video';
const Video = VideoBase as any;
import Slider from '@react-native-community/slider';
import OrientationLocker from 'react-native-orientation-locker';
import { VideoItem } from '../types/video';
import { formatTime } from '../utils/videoUtils';

interface Props {
  video: VideoItem;
  onBack?: () => void;
  onLoadStart?: () => void;
  onLoadComplete?: () => void;
  onError?: (error: any) => void;
}

const SEEK_SECS    = 10;
const HIDE_DELAY   = 4000;
const DBL_TAP_MS   = 280;
const SPEEDS       = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SWIPE_SPAN   = 90; // seconds per full-width horizontal swipe
const resumeKey    = (uri: string) => `vp_resume:${uri}`;

const VideoPlayer: React.FC<Props> = ({
  video, onBack, onLoadStart, onLoadComplete, onError,
}) => {
  const videoRef = useRef<any>(null);

  // ── state ──────────────────────────────────────────────────────────────
  const [isPlaying,     setIsPlaying]     = useState(true);
  const [currentTime,   setCurrentTime]   = useState(0);
  const [duration,      setDuration]      = useState(0);
  const [volume,        setVolume]        = useState(1);
  const [speed,         setSpeed]         = useState(1);
  const [loading,       setLoading]       = useState(true);
  const [showControls,  setShowControls]  = useState(true);
  const [isLocked,      setIsLocked]      = useState(false);
  const [seekLabel,     setSeekLabel]     = useState('');
  const [volPct,        setVolPct]        = useState<number | null>(null);
  const [brightPct,     setBrightPct]     = useState<number | null>(null);
  const [seekInfo,      setSeekInfo]      = useState<{ delta: number; preview: number } | null>(null);
  const [audioTracks,   setAudioTracks]   = useState<{ index: number; title: string; language: string; type: string }[]>([]);
  const [selTrackIdx,   setSelTrackIdx]   = useState<number | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [resizeMode,    setResizeMode]    = useState<'contain' | 'cover' | 'stretch'>('contain');
  const [isPipMode,     setIsPipMode]     = useState(false);

  // ── stable refs ────────────────────────────────────────────────────────
  const ctRef       = useRef(0);
  const durRef      = useRef(0);
  const volRef      = useRef(1);
  const playRef     = useRef(true);
  const lockedRef   = useRef(false);
  const ctrlVisRef  = useRef(true);
  const brightRef   = useRef(0.5);

  const hideTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap      = useRef<{ time: number; side: 'L' | 'R' } | null>(null);

  // gesture refs
  const gestStartY      = useRef(0);
  const gestStartX      = useRef(0);
  const gestStartVol    = useRef(1);
  const gestStartBright = useRef(0.5);
  const gestRightHalf   = useRef(false);
  const gestMoved       = useRef(false);
  const gestType        = useRef<'none' | 'seek' | 'vol' | 'bright'>('none');
  const isSeekGest      = useRef(false);
  const seekStartCt     = useRef(0);
  const lastSaveTime    = useRef(0);   // wall-clock ms of last AsyncStorage save
  const savedLoaded     = useRef(false); // did we already apply the saved resume?
  const isInBackgroundRef = useRef(false); // true while app is backgrounded

  // ── animated ───────────────────────────────────────────────────────────
  const ctrlOpacity = useRef(new Animated.Value(1)).current;
  const seekAnim    = useRef(new Animated.Value(0)).current;

  // ── keep refs in sync ──────────────────────────────────────────────────
  useEffect(() => { ctRef.current      = currentTime;  }, [currentTime]);
  useEffect(() => { durRef.current     = duration;     }, [duration]);
  useEffect(() => { volRef.current     = volume;       }, [volume]);
  useEffect(() => { playRef.current    = isPlaying;    }, [isPlaying]);
  useEffect(() => { lockedRef.current  = isLocked;     }, [isLocked]);
  useEffect(() => { ctrlVisRef.current = showControls; }, [showControls]);

  // ── control visibility (ref-wrapped so PanResponder always calls latest) ─
  const scheduleFn = useRef<() => void>(() => {});
  const revealFn   = useRef<() => void>(() => {});
  const hideFn     = useRef<() => void>(() => {});

  scheduleFn.current = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playRef.current) {
        Animated.timing(ctrlOpacity, { toValue: 0, duration: 400, useNativeDriver: true })
          .start(({ finished }) => { if (finished) setShowControls(false); });
      }
    }, HIDE_DELAY);
  };

  revealFn.current = () => {
    setShowControls(true);
    Animated.timing(ctrlOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    scheduleFn.current();
  };

  hideFn.current = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.timing(ctrlOpacity, { toValue: 0, duration: 200, useNativeDriver: true })
      .start(({ finished }) => { if (finished) setShowControls(false); });
  };

  // ── double-tap seek flash ──────────────────────────────────────────────
  const flashSeekFn = useRef<(label: string) => void>(() => {});
  flashSeekFn.current = (label: string) => {
    setSeekLabel(label);
    seekAnim.setValue(1);
    Animated.timing(seekAnim, { toValue: 0, duration: 600, delay: 400, useNativeDriver: true }).start();
  };

  // ── mount / unmount ────────────────────────────────────────────────────
  useEffect(() => {
    OrientationLocker.lockToLandscape();
    StatusBar.setHidden(true);
    scheduleFn.current();
    const PipMod = (NativeModules as any).PipModule;
    // Hide status bar + navigation bar (full immersive mode)
    PipMod?.setImmersiveMode(true);
    if (PipMod?.getBrightness) {
      PipMod.getBrightness()
        .then((b: number) => { brightRef.current = b > 0 ? b : 0.5; })
        .catch(() => {});
    }
    // Request POST_NOTIFICATIONS permission (Android 13+)
    if (Platform.OS === 'android' && (Platform.Version as number) >= 33) {
      PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS').catch(() => {});
    }
    // Android back button → go back to list, not exit app
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack?.();
      return true; // prevent default (which would exit the app)
    });
    return () => {
      backSub.remove();
      OrientationLocker.unlockAllOrientations();
      StatusBar.setHidden(false);
      // Restore system bars on exit
      (NativeModules as any).PipModule?.setImmersiveMode(false);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (tapTimer.current)  clearTimeout(tapTimer.current);
      (NativeModules as any).PipModule?.setBrightness(-1);
      // Dismiss media notification
      (NativeModules as any).MediaNotification?.hideNotification();
      // Save final position on unmount
      const pos = ctRef.current;
      const dur = durRef.current;
      if (pos > 5 && dur > 0 && pos / dur < 0.95) {
        AsyncStorage.setItem(resumeKey(video.uri), JSON.stringify({ pos, dur, ts: Date.now() }));
      } else if (pos / dur >= 0.95) {
        AsyncStorage.removeItem(resumeKey(video.uri)); // finished – clear resume
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (!isPlaying) revealFn.current(); }, [isPlaying]);

  // ── PiP floating window ──────────────────────────────────────
  // 'PipPlayPause'      → user tapped play/pause button in the floating PiP window
  // 'PipModeChanged'    → app entered or exited PiP; hide/show controls accordingly
  // 'NotificationPlayPause' → user tapped play/pause in the notification bar
  // 'NotificationStop'  → user tapped Stop in the notification bar
  useEffect(() => {
    const playSub = DeviceEventEmitter.addListener('PipPlayPause', () => {
      setIsPlaying(p => !p);
    });
    const modeSub = DeviceEventEmitter.addListener('PipModeChanged', (inPip: boolean) => {
      setIsPipMode(inPip);
      if (inPip) setShowControls(false); // clear controls immediately on entering PiP
    });
    const notifPlaySub = DeviceEventEmitter.addListener('NotificationPlayPause', () => {
      setIsPlaying(p => !p);
    });
    const notifStopSub = DeviceEventEmitter.addListener('NotificationStop', () => {
      setIsPlaying(false);
      onBack?.();
    });
    return () => {
      playSub.remove();
      modeSub.remove();
      notifPlaySub.remove();
      notifStopSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the PiP button icon in sync; show/update notification only if already backgrounded
  useEffect(() => {
    (NativeModules as any).PipModule?.updatePipParams(isPlaying);
    if (isInBackgroundRef.current) {
      (NativeModules as any).MediaNotification?.showNotification(video.title, isPlaying);
    }
  }, [isPlaying, video.title]);

  // Show media notification when app goes to background; hide when it returns
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'background') {
        isInBackgroundRef.current = true;
        (NativeModules as any).MediaNotification?.showNotification(video.title, playRef.current);
      } else if (nextState === 'active') {
        isInBackgroundRef.current = false;
        (NativeModules as any).MediaNotification?.hideNotification();
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── seek helper ────────────────────────────────────────────────────────
  const rawSeek = (time: number) => {
    const t = Math.max(0, Math.min(durRef.current, time));
    videoRef.current?.seek(t);
    setCurrentTime(t);
    ctRef.current = t;
  };

  // ── button handlers ────────────────────────────────────────────────────
  const handleRewind    = () => { rawSeek(ctRef.current - SEEK_SECS); flashSeekFn.current(`\xAB ${SEEK_SECS}s`); revealFn.current(); };
  const handleForward   = () => { rawSeek(ctRef.current + SEEK_SECS); flashSeekFn.current(`${SEEK_SECS}s \xBB`); revealFn.current(); };
  const handlePlayPause = () => { setIsPlaying(p => !p); revealFn.current(); };
  const handleLock      = () => { setIsLocked(l => !l); };
  const handleSpeed     = () => { setSpeed(s => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]); revealFn.current(); };
  const handleMinimize  = () => { (NativeModules as any).PipModule?.enterPipMode(); };

  // ── PanResponder ───────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dy) > 8 || Math.abs(gs.dx) > 8,

      onPanResponderGrant: (evt) => {
        const { width } = Dimensions.get('window');
        gestStartY.current      = evt.nativeEvent.pageY;
        gestStartX.current      = evt.nativeEvent.pageX;
        gestStartVol.current    = volRef.current;
        gestStartBright.current = brightRef.current;
        gestRightHalf.current   = evt.nativeEvent.pageX > width / 2;
        gestMoved.current       = false;
        gestType.current        = 'none';
      },

      onPanResponderMove: (_, gs) => {
        if (lockedRef.current) return;
        const ax = Math.abs(gs.dx);
        const ay = Math.abs(gs.dy);
        if (ax < 8 && ay < 8) return;
        gestMoved.current = true;

        // Lock gesture type on first significant movement
        if (gestType.current === 'none') {
          if (ax > ay) {
            gestType.current  = 'seek';
            isSeekGest.current = true;
            seekStartCt.current = ctRef.current;
          } else {
            gestType.current = gestRightHalf.current ? 'bright' : 'vol';
          }
        }

        if (gestType.current === 'seek') {
          const { width } = Dimensions.get('window');
          const delta   = (gs.dx / width) * SWIPE_SPAN;
          const preview = Math.max(0, Math.min(durRef.current, seekStartCt.current + delta));
          setCurrentTime(preview);
          setSeekInfo({ delta: Math.round(delta), preview });

        } else if (gestType.current === 'vol') {
          const { height } = Dimensions.get('window');
          const newVol = Math.max(0, Math.min(1, gestStartVol.current - gs.dy / (height * 0.6)));
          setVolume(newVol);
          volRef.current = newVol;
          setVolPct(Math.round(newVol * 100));

        } else if (gestType.current === 'bright') {
          const { height } = Dimensions.get('window');
          const nb = Math.max(0.01, Math.min(1, gestStartBright.current - gs.dy / (height * 0.6)));
          brightRef.current = nb;
          setBrightPct(Math.round(nb * 100));
          (NativeModules as any).PipModule?.setBrightness(nb);
        }
      },

      onPanResponderRelease: (evt, gs) => {
        if (lockedRef.current) return;

        if (gestMoved.current) {
          if (gestType.current === 'seek') {
            const { width } = Dimensions.get('window');
            const finalTime = Math.max(0, Math.min(
              durRef.current,
              seekStartCt.current + (gs.dx / width) * SWIPE_SPAN,
            ));
            videoRef.current?.seek(finalTime);
            ctRef.current    = finalTime;
            isSeekGest.current = false;
            setTimeout(() => setSeekInfo(null), 700);
          } else if (gestType.current === 'vol') {
            setTimeout(() => setVolPct(null), 800);
          } else if (gestType.current === 'bright') {
            setTimeout(() => setBrightPct(null), 800);
          }
          gestMoved.current = false;
          gestType.current  = 'none';
          return;
        }

        // ── tap logic ──────────────────────────────────────────────────
        const { width } = Dimensions.get('window');
        const side: 'L' | 'R' = evt.nativeEvent.pageX < width / 2 ? 'L' : 'R';
        const now = Date.now();

        if (
          lastTap.current &&
          now - lastTap.current.time < DBL_TAP_MS &&
          lastTap.current.side === side
        ) {
          if (tapTimer.current) clearTimeout(tapTimer.current);
          lastTap.current = null;
          if (side === 'L') { rawSeek(ctRef.current - SEEK_SECS); flashSeekFn.current(`\xAB ${SEEK_SECS}s`); }
          else               { rawSeek(ctRef.current + SEEK_SECS); flashSeekFn.current(`${SEEK_SECS}s \xBB`); }
          revealFn.current();
          return;
        }

        lastTap.current = { time: now, side };
        if (tapTimer.current) clearTimeout(tapTimer.current);
        tapTimer.current = setTimeout(() => {
          lastTap.current = null;
          if (ctrlVisRef.current) hideFn.current(); else revealFn.current();
        }, DBL_TAP_MS + 20);
      },
    })
  ).current;

  // ── render ─────────────────────────────────────────────────────────────
  const speedLabel = speed === 1 ? '1\xD7' : `${speed}\xD7`;

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      <StatusBar hidden />

      {/* Video */}
      <Video
        ref={videoRef}
        source={{ uri: video.uri }}
        style={styles.video}
        controls={false}
        paused={!isPlaying}
        volume={volume}
        rate={speed}
        resizeMode={resizeMode}
        useTextureView={true}
        maxBitRate={0}
        bufferConfig={{
          minBufferMs: 15000,
          maxBufferMs: 60000,
          bufferForPlaybackMs: 2500,
          bufferForPlaybackAfterRebufferMs: 5000,
        }}
        playInBackground={true}
        playWhenInactive={true}
        onLoadStart={() => { setLoading(true); onLoadStart?.(); }}
        selectedAudioTrack={selTrackIdx !== null ? { type: 'index', value: selTrackIdx } : undefined}
        onLoad={(data: any) => {
          setDuration(data.duration);
          durRef.current = data.duration;
          setLoading(false);
          onLoadComplete?.();
          if (data.audioTracks && data.audioTracks.length > 1) {
            setAudioTracks(data.audioTracks);
            const def = data.audioTracks.findIndex((t: any) => t.selected);
            setSelTrackIdx(def >= 0 ? def : 0);
          }
          // Seek to saved resume position (once)
          if (!savedLoaded.current) {
            savedLoaded.current = true;
            AsyncStorage.getItem(resumeKey(video.uri)).then(raw => {
              if (!raw) return;
              const { pos, dur } = JSON.parse(raw) as { pos: number; dur: number; ts: number };
              if (pos > 5 && dur > 0 && pos / dur < 0.95) {
                videoRef.current?.seek(pos);
                setCurrentTime(pos);
                ctRef.current = pos;
              }
            }).catch(() => {});
          }
        }}
        onError={(err: any) => { setLoading(false); onError?.(err); }}
        onProgress={(data: any) => {
          if (!isSeekGest.current) {
            setCurrentTime(data.currentTime);
            ctRef.current = data.currentTime;
          }
          // Persist position every 5 seconds
          const now = Date.now();
          if (now - lastSaveTime.current > 5000) {
            lastSaveTime.current = now;
            const pos = data.currentTime;
            const dur = durRef.current;
            if (pos > 5 && dur > 0 && pos / dur < 0.95) {
              AsyncStorage.setItem(resumeKey(video.uri), JSON.stringify({ pos, dur, ts: now }));
            }
          }
        }}
        onEnd={() => setIsPlaying(false)}
      />

      {/* Loading */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {/* Double-tap seek flash */}
      <Animated.View style={[styles.seekFlash, { opacity: seekAnim }]} pointerEvents="none">
        <Text style={styles.seekFlashText}>{seekLabel}</Text>
      </Animated.View>

      {/* Swipe seek overlay */}
      {seekInfo && (
        <View style={styles.seekOverlay} pointerEvents="none">
          <Text style={styles.seekOverlayDelta}>
            {seekInfo.delta >= 0 ? `+${seekInfo.delta}s  \u2192` : `\u2190  ${seekInfo.delta}s`}
          </Text>
          <Text style={styles.seekOverlayTime}>
            {formatTime(seekInfo.preview)}  /  {formatTime(duration)}
          </Text>
          <View style={styles.seekBarBg}>
            <View
              style={[
                styles.seekBarFill,
                { width: duration > 0 ? (seekInfo.preview / duration) * 180 : 0 },
              ]}
            />
          </View>
        </View>
      )}

      {/* Volume indicator (left side) */}
      {volPct !== null && (
        <View style={[styles.sideBar, styles.sideBarLeft]} pointerEvents="none">
          <Text style={styles.sideBarEmoji}>
            {volPct === 0 ? '\uD83D\uDD07' : volPct < 50 ? '\uD83D\uDD09' : '\uD83D\uDD0A'}
          </Text>
          <View style={styles.sideBarTrack}>
            <View style={{ flex: 100 - volPct }} />
            <View style={[styles.sideBarFill, { flex: volPct }]} />
          </View>
          <Text style={styles.sideBarPct}>{volPct}%</Text>
        </View>
      )}

      {/* Brightness indicator (right side) */}
      {brightPct !== null && (
        <View style={[styles.sideBar, styles.sideBarRight]} pointerEvents="none">
          <Text style={styles.sideBarEmoji}>
            {brightPct < 30 ? '\uD83C\uDF19' : brightPct < 70 ? '\uD83D\uDD06' : '\u2600\uFE0F'}
          </Text>
          <View style={styles.sideBarTrack}>
            <View style={{ flex: 100 - brightPct }} />
            <View style={[styles.sideBarFill, { flex: brightPct }]} />
          </View>
          <Text style={styles.sideBarPct}>{brightPct}%</Text>
        </View>
      )}

      {/* Controls, modal, and lock — all hidden in PiP mode (PiP window is tiny; only the native play button shows) */}
      {!isPipMode ? (
        <>

      {/* Controls overlay */}
      <Animated.View
        style={[styles.controlsOverlay, { opacity: ctrlOpacity }]}
        pointerEvents={showControls && !isLocked ? 'box-none' : 'none'}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onBack} style={styles.topBackBtn}>
            <Text style={styles.topBackIcon}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle} numberOfLines={1}>
            {video.title}
          </Text>
        </View>


        {/* Bottom bar */}
        <View style={styles.bottomBar}>
          <View style={styles.progressRow}>
            <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={duration || 1}
              value={currentTime}
              onSlidingStart={() => { if (hideTimer.current) clearTimeout(hideTimer.current); }}
              onSlidingComplete={(val) => { rawSeek(val); scheduleFn.current(); }}
              minimumTrackTintColor="#FF6B35"
              maximumTrackTintColor="rgba(255,255,255,0.25)"
              thumbTintColor="#FF6B35"
            />
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>

          <View style={styles.bottomActionsRow}>
            <TouchableOpacity onPress={handleRewind} style={styles.bottomBtn}>
              <Text style={styles.bottomBtnText}>{'↺'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handlePlayPause} style={styles.playPauseBtn}>
              <Text style={styles.playPauseIcon}>{isPlaying ? '⏸' : '▶'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleForward} style={styles.bottomBtn}>
              <Text style={styles.bottomBtnText}>{'↻'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSpeed} style={styles.bottomBtn}>
              <Text style={styles.bottomBtnText}>{speedLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setResizeMode(m => m === 'contain' ? 'cover' : m === 'cover' ? 'stretch' : 'contain')}
              style={styles.bottomBtn}
            >
              <Text style={styles.bottomBtnText}>
                {resizeMode === 'contain' ? '⛶' : resizeMode === 'cover' ? '⤢' : '⇲'}
              </Text>
            </TouchableOpacity>

            <View style={styles.volRow}>
              <Text style={styles.volIcon}>{'\uD83D\uDD0A'}</Text>
              <Slider
                style={styles.volSlider}
                minimumValue={0}
                maximumValue={1}
                value={volume}
                onValueChange={(v) => { setVolume(v); volRef.current = v; }}
                minimumTrackTintColor="#FF6B35"
                maximumTrackTintColor="rgba(255,255,255,0.25)"
                thumbTintColor="#FF6B35"
              />
            </View>

            <TouchableOpacity onPress={() => setShowLangPicker(true)} style={styles.bottomBtn}>
              <Text style={styles.bottomBtnText}>
                {audioTracks.length > 1 && selTrackIdx !== null && audioTracks[selTrackIdx]
                  ? (audioTracks[selTrackIdx].language || audioTracks[selTrackIdx].title || 'AUD').toUpperCase().slice(0, 3)
                  : '🎵'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLock} style={styles.bottomBtn}>
              <Text style={styles.bottomBtnText}>{isLocked ? '\uD83D\uDD12' : '\uD83D\uDD13'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleMinimize} style={styles.bottomBtn}>
              <Text style={styles.bottomBtnText}>{'\u229E'}</Text>
            </TouchableOpacity>
          </View>
        </View>


      </Animated.View>

      {/* Language picker modal */}
      <Modal
        visible={showLangPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLangPicker(false)}
      >
        <TouchableOpacity style={styles.langModalBg} activeOpacity={1} onPress={() => setShowLangPicker(false)}>
          <View style={styles.langModalBox}>
            <Text style={styles.langModalTitle}>Audio Track</Text>
            {audioTracks.length === 0 ? (
              <Text style={styles.langNoTrack}>No multiple tracks available</Text>
            ) : (
              <FlatList
                data={audioTracks}
                keyExtractor={(_, i) => String(i)}
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    style={[styles.langItem, selTrackIdx === index && styles.langItemActive]}
                    onPress={() => { setSelTrackIdx(index); setShowLangPicker(false); }}
                  >
                    <Text style={[styles.langItemText, selTrackIdx === index && styles.langItemTextActive]}>
                      {item.title && item.title !== item.language
                        ? `${item.title}${item.language ? ` (${item.language})` : ''}`
                        : item.language || `Track ${index + 1}`}
                    </Text>
                    {selTrackIdx === index && <Text style={styles.langCheck}>✓</Text>}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Lock overlay */}
      {isLocked && (
        <TouchableOpacity style={styles.lockOverlay} onPress={handleLock} activeOpacity={1}>
          <View style={styles.unlockPill}>
            <Text style={styles.unlockText}>{'\uD83D\uDD12'}  Tap to unlock</Text>
          </View>
        </TouchableOpacity>
      )}
        </>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#000' },
  video: { ...StyleSheet.absoluteFillObject },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },

  // Double-tap flash
  seekFlash: {
    position: 'absolute', top: '40%', alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 30,
  },
  seekFlashText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  // Swipe seek overlay
  seekOverlay: {
    position: 'absolute', top: '30%', alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14,
    alignItems: 'center', minWidth: 200,
  },
  seekOverlayDelta: { color: '#FF6B35', fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  seekOverlayTime:  { color: '#fff', fontSize: 14, marginBottom: 10 },
  seekBarBg:  { width: 180, height: 4, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' },
  seekBarFill: { height: 4, backgroundColor: '#FF6B35', borderRadius: 2 },

  // Side indicator (volume / brightness)
  sideBar: {
    position: 'absolute', top: '15%',
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 14, padding: 10,
    alignItems: 'center', width: 56, height: 180,
  },
  sideBarLeft:  { left: 20 },
  sideBarRight: { right: 20 },
  sideBarEmoji: { fontSize: 18 },
  sideBarTrack: {
    flex: 1, width: 8, marginVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4, overflow: 'hidden',
  },
  sideBarFill:  { width: 8, backgroundColor: '#FF6B35', borderRadius: 4 },
  sideBarPct:   { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  // Controls overlay
  controlsOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  topBackBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 4,
  },
  topBackIcon: { color: '#fff', fontSize: 36, lineHeight: 40, fontWeight: '300' },
  topTitle: {
    flex: 1, color: '#fff', fontSize: 15, fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },

  // Play/pause btn (in bottom bar)
  playPauseBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  playPauseIcon: { color: '#fff', fontSize: 20 },

  // Bottom bar
  bottomBar:       { paddingHorizontal: 12, paddingBottom: 8, backgroundColor: 'transparent' },
  progressRow:     { flexDirection: 'row', alignItems: 'center' },
  timeText:        { color: '#ddd', fontSize: 12, minWidth: 44, textAlign: 'center' },
  slider:          { flex: 1, height: 36 },
  bottomActionsRow:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 2 },
  bottomBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, minWidth: 48, alignItems: 'center',
  },
  bottomBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  volRow:  { flex: 1, flexDirection: 'row', alignItems: 'center', marginHorizontal: 12 },
  volIcon: { fontSize: 16, marginRight: 4 },
  volSlider: { flex: 1, height: 32 },

  // Lock overlay
  lockOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'flex-start', justifyContent: 'center', paddingLeft: 20 },
  unlockPill:  { backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 30, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  unlockText:  { color: '#fff', fontSize: 15, fontWeight: 'bold' },

  // Language picker modal
  langModalBg:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  langModalBox:      { backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 8, minWidth: 240, maxWidth: 340, maxHeight: 360, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  langModalTitle:    { color: '#FF6B35', fontSize: 14, fontWeight: '700', textAlign: 'center', paddingVertical: 10, letterSpacing: 1 },
  langItem:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  langItemActive:    { backgroundColor: 'rgba(255,107,53,0.15)' },
  langItemText:      { color: '#ccc', fontSize: 14, flex: 1 },
  langItemTextActive:{ color: '#FF6B35', fontWeight: '700' },
  langCheck:         { color: '#FF6B35', fontSize: 16, marginLeft: 8 },
  langNoTrack:       { color: '#888', fontSize: 13, textAlign: 'center', paddingVertical: 16, paddingHorizontal: 20 },
});

export default VideoPlayer;
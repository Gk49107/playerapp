import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  BackHandler,
  ActivityIndicator,
  FlatList,
  Modal,
  Alert,
  ToastAndroid,
  Keyboard,
  Linking,
  AppState,
  ScrollView,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import notifee, { AndroidImportance } from '@notifee/react-native';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Tab {
  id: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  progress: number;
  groupId?: string;
}

interface TabGroup {
  id: string;
  name: string;
  color: string;
}

interface Bookmark {
  id: string;
  title: string;
  url: string;
}

interface HistoryItem {
  id: string;
  title: string;
  url: string;
  timestamp: number;
}

interface DownloadItem {
  id: string;
  filename: string;
  url: string;
  status: 'downloading' | 'done' | 'error';
  progress: number;
  savedPath?: string;
  error?: string;
  timestamp: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const HOME_URL      = 'https://www.google.com';
const BOOKMARKS_KEY = 'browser_bookmarks';
const HISTORY_KEY   = 'browser_history';
const DOWNLOADS_KEY = 'browser_downloads';
const ADBLOCK_KEY   = 'browser_adblock';
const GROUPS_KEY    = 'browser_tab_groups';
const DOWNLOAD_EXTS = /\.(pdf|zip|apk|mp3|m4a|wav|exe|doc|docx|xls|xlsx|ppt|pptx|rar|7z|tar|gz|dmg|deb|rpm)$/i;

const GROUP_COLORS = ['#e53935','#fb8c00','#fdd835','#43a047','#1e88e5','#8e24aa','#00897b','#f06292'];

// ─── Ad-blocker ───────────────────────────────────────────────────────────────
const AD_DOMAINS = [
  'doubleclick.net','googleadservices.com','googlesyndication.com',
  'google-analytics.com','googletagmanager.com','adservice.google.com',
  'amazon-adsystem.com','adsystem.amazon.com','advertising.com',
  'adnxs.com','appnexus.com','taboola.com','outbrain.com',
  'criteo.com','criteo.net','pubmatic.com','rubiconproject.com',
  'openx.net','casalemedia.com','indexww.com','bidswitch.net',
  'adform.net','media.net','moatads.com','scorecardresearch.com',
  'quantserve.com','demdex.net','mathtag.com','spotxchange.com',
  'teads.tv','teads.com','tremorvideo.com','vidazoo.com',
  'sovrn.com','sharethrough.com','yieldlove.com','yieldmo.com',
  'smartadserver.com','cdn.carbonads.com','srv.carbonads.net',
  'connect.facebook.net','an.facebook.com',
  'ads.twitter.com','bat.bing.com','bat.r.msn.com',
  'revcontent.com','spotx.tv','smartclip.net',
];

const isAdUrl = (raw: string): boolean => {
  try {
    const m = raw.match(/^https?:\/\/([^/?#:]+)/i);
    if (!m) return false;
    const h = m[1].toLowerCase().replace(/^www\./, '');
    return AD_DOMAINS.some(d => h === d || h.endsWith('.' + d));
  } catch { return false; }
};

const AD_BLOCK_JS = `(function(){
  // Never touch YouTube — it has its own targeted ad-skip script
  try{if(/youtube\.com|youtu\.be/.test(location.hostname))return true;}catch(e){}
  try{
    var css='.adsbygoogle,'+
      '.banner-ad,.display-ad,.native-ad,[class*="advertisement"],'+
      '[id*="advertisement"],.sponsored-content,.sponsored-post,'+
      '[data-ad-slot],'+
      'iframe[src*="googlesyndication"],iframe[src*="doubleclick"],'+
      'ins.adsbygoogle{display:none!important;height:0!important;overflow:hidden!important;}';
    var s=document.createElement('style');
    s.textContent=css;
    (document.head||document.documentElement).appendChild(s);
    new MutationObserver(function(ms){
      ms.forEach(function(mu){
        mu.addedNodes.forEach(function(n){
          if(n.nodeType===1){var e=n;if(e.className&&typeof e.className==='string'&&
            (e.className.includes('adsbygoogle')||e.className.includes('sponsored'))){
            e.style&&(e.style.display='none');}}
        });
      });
    }).observe(document.body||document.documentElement,{childList:true,subtree:true});
  }catch(e){}
  true;
})();`;

const SEARCH_ENGINE = (q: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(q)}`;

const YOUTUBE_BG_JS = `(function(){
  try{
    // Override Page Visibility API so YouTube never sees the page as hidden
    Object.defineProperty(document,'hidden',{get:function(){return false;},configurable:true});
    Object.defineProperty(document,'visibilityState',{get:function(){return 'visible';},configurable:true});
    // Block all registration of visibilitychange listeners
    var _ael=EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener=function(type,fn,opts){
      if(type==='visibilitychange'||type==='webkitvisibilitychange')return;
      return _ael.call(this,type,fn,opts);
    };
    var _del=EventTarget.prototype.removeEventListener;
    EventTarget.prototype.removeEventListener=function(type,fn,opts){
      if(type==='visibilitychange'||type==='webkitvisibilitychange')return;
      return _del.call(this,type,fn,opts);
    };
    // Swallow any direct dispatchEvent calls for visibilitychange
    var _dispatch=EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent=function(event){
      if(event&&(event.type==='visibilitychange'||event.type==='webkitvisibilitychange'))return true;
      return _dispatch.call(this,event);
    };
    // Prevent video elements from auto-pausing
    var _pause=HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause=function(){
      // only block pause when document would be 'hidden' — i.e. never
      if(!document._ytbg_allow_pause)return;
      return _pause.apply(this,arguments);
    };
    // Allow explicit user-initiated pause via a flag
    document.addEventListener('click',function(){
      document._ytbg_allow_pause=true;
      setTimeout(function(){document._ytbg_allow_pause=false;},500);
    },true);
  }catch(e){}
  true;
})();`;

const YOUTUBE_AD_JS = `(function(){
  function skipAds(){
    var skip=document.querySelector(
      '.ytp-skip-ad-button,.ytp-skip-ad-button__label,.videoAdUiSkipButton,.ytp-ad-skip-button-modern');
    if(skip){skip.click();return;}
    var adShowing=document.querySelector('.ad-showing');
    if(adShowing){
      var vid=document.querySelector('video');
      if(vid&&vid.duration&&isFinite(vid.duration))vid.currentTime=vid.duration;
    }
  }
  setInterval(skipAds,400);
  var css=
    '.ytp-ad-player-overlay-instream-info,'+
    '.ytp-ad-text-overlay,.ytp-ad-preview-container,'+
    '.ytp-ad-overlay-close-container,.ytp-paid-content-overlay,'+
    '.ytp-ad-progress-list,.ytp-ad-simple-ad-badge{display:none!important}';
  var st=document.createElement('style');st.textContent=css;
  (document.head||document.documentElement).appendChild(st);
  var _lastTitle='';
  function reportPlaying(){
    try{
      var vid=document.querySelector('video');
      var titleEl=document.querySelector('h1.ytd-video-primary-info-renderer,.ytp-title-link');
      var title=(titleEl&&titleEl.textContent.trim())||document.title||'';
      if(!vid||!window.ReactNativeWebView)return;
      var paused=vid.paused||vid.ended;
      if(title!==_lastTitle||!paused){
        _lastTitle=title;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type:'yt_state',title:title,paused:paused,
          host:location.hostname
        }));
      }
    }catch(e){}
  }
  setInterval(reportPlaying,2000);
  true;
})();`;

const normaliseUrl = (raw: string): string => {
  const s = raw.trim();
  if (!s) return HOME_URL;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9-]+\.[a-z]{2,}/i.test(s)) return `https://${s}`;
  return SEARCH_ENGINE(s);
};

const makeTab = (url = HOME_URL): Tab => ({
  id: `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  url,
  title: '',
  canGoBack: false,
  canGoForward: false,
  loading: true,
  progress: 0,
});

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  onClose: () => void;
}

const BrowserScreen: React.FC<Props> = ({ onClose }) => {
  const webRefs         = useRef<Record<string, WebView | null>>({});
  const historyRef      = useRef<HistoryItem[]>([]);
  const lastHistoryUrl  = useRef('');
  const nowPlayingRef   = useRef('');
  const lastNotifUpdate = useRef<Record<string, number>>({});

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [tabs, setTabs]               = useState<Tab[]>(() => [makeTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const t = makeTab();
    return t.id;
  });
  const [tabGroups, setTabGroups]         = useState<TabGroup[]>([]);
  const [showTabSwitcher, setShowTabSwitcher] = useState(false);
  const [showGroupMenu, setShowGroupMenu]     = useState(false);
  const [groupMenuTabId, setGroupMenuTabId]   = useState('');
  const [newGroupName, setNewGroupName]       = useState('');
  const [newGroupColor, setNewGroupColor]     = useState(GROUP_COLORS[0]);

  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0];

  // ── Address bar ────────────────────────────────────────────────────────────
  const [inputText, setInputText] = useState(HOME_URL);

  // ── Other UI ───────────────────────────────────────────────────────────────
  const [bookmarks, setBookmarks]       = useState<Bookmark[]>([]);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [history, setHistory]           = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory]   = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [downloads, setDownloads]       = useState<DownloadItem[]>([]);
  const [showDownloads, setShowDownloads] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [adBlockEnabled, setAdBlockEnabled] = useState(true);
  const [nowPlayingTitle, setNowPlayingTitle] = useState('');

  // ── Tab helpers ────────────────────────────────────────────────────────────
  const updateTab = useCallback((id: string, updates: Partial<Tab>) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const createTab = useCallback((url = HOME_URL) => {
    const tab = makeTab(url);
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
    setInputText(url);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      if (prev.length === 1) {
        const fresh = makeTab();
        setActiveTabId(fresh.id);
        setInputText(HOME_URL);
        return [fresh];
      }
      const idx = prev.findIndex(t => t.id === id);
      const next = prev.filter(t => t.id !== id);
      setActiveTabId(cur => {
        if (cur !== id) return cur;
        const newActive = next[Math.min(idx, next.length - 1)];
        setInputText(newActive.url);
        return newActive.id;
      });
      return next;
    });
  }, []);

  const switchTab = useCallback((id: string) => {
    setTabs(prev => {
      const tab = prev.find(t => t.id === id);
      if (tab) setInputText(tab.url);
      return prev;
    });
    setActiveTabId(id);
  }, []);

  // ── Tab group helpers ──────────────────────────────────────────────────────
  const assignGroup = useCallback((tabId: string, groupId: string | undefined) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, groupId } : t));
  }, []);

  const createGroup = useCallback((name: string, color: string, tabId: string) => {
    const groupId = `grp_${Date.now()}`;
    setTabGroups(prev => [...prev, { id: groupId, name, color }]);
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, groupId } : t));
  }, []);

  const deleteGroup = useCallback((groupId: string) => {
    setTabGroups(prev => prev.filter(g => g.id !== groupId));
    setTabs(prev => prev.map(t => t.groupId === groupId ? { ...t, groupId: undefined } : t));
  }, []);

  const openGroupMenu = useCallback((tabId: string) => {
    setGroupMenuTabId(tabId);
    setNewGroupName('');
    setNewGroupColor(GROUP_COLORS[0]);
    setShowGroupMenu(true);
  }, []);

  // ── Load persisted data on mount ──────────────────────────────────────────
  useEffect(() => {
    notifee.requestPermission().catch(() => {});
    notifee.createChannel({ id: 'downloads', name: 'Downloads', importance: AndroidImportance.DEFAULT }).catch(() => {});
    notifee.createChannel({ id: 'media', name: 'Now Playing', importance: AndroidImportance.LOW }).catch(() => {});
    AsyncStorage.getItem(ADBLOCK_KEY).then(v => { if (v !== null) setAdBlockEnabled(v === 'true'); }).catch(() => {});
    AsyncStorage.getItem(BOOKMARKS_KEY).then(raw => { if (raw) setBookmarks(JSON.parse(raw)); }).catch(() => {});
    AsyncStorage.getItem(HISTORY_KEY).then(raw => {
      if (raw) { const h: HistoryItem[] = JSON.parse(raw); historyRef.current = h; setHistory(h); }
    }).catch(() => {});
    AsyncStorage.getItem(DOWNLOADS_KEY).then(raw => {
      if (raw) {
        const dl: DownloadItem[] = JSON.parse(raw);
        setDownloads(dl.map(d => d.status === 'downloading' ? { ...d, status: 'error' as const, error: 'Interrupted' } : d));
      }
    }).catch(() => {});
    AsyncStorage.getItem(GROUPS_KEY).then(raw => { if (raw) setTabGroups(JSON.parse(raw)); }).catch(() => {});
  }, []);

  // ── Persist tab groups ─────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.setItem(GROUPS_KEY, JSON.stringify(tabGroups)).catch(() => {});
  }, [tabGroups]);

  // ── Hardware back ──────────────────────────────────────────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeTab?.canGoBack) {
        webRefs.current[activeTabId]?.goBack();
      } else {
        onClose();
      }
      return true;
    });
    return () => sub.remove();
  }, [activeTab?.canGoBack, activeTabId, onClose]);

  // ── Sync bookmark indicator ────────────────────────────────────────────────
  useEffect(() => {
    setIsBookmarked(bookmarks.some(b => b.url === (activeTab?.url ?? '')));
  }, [activeTab?.url, bookmarks]);

  // ── Sync URL bar when switching tabs ──────────────────────────────────────
  useEffect(() => {
    if (activeTab) setInputText(activeTab.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  // ── AppState: YouTube media notification ──────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      const isYT = /youtube\.com/i.test(activeTab?.url ?? '');
      if (nextState === 'background' && isYT && nowPlayingRef.current) {
        notifee.displayNotification({
          id: 'yt_media',
          title: '▶ YouTube — Playing in background',
          body: nowPlayingRef.current,
          android: {
            channelId: 'media',
            ongoing: true,
            smallIcon: 'ic_notification',
            pressAction: { id: 'default' },
            actions: [{ title: '⏹ Stop', pressAction: { id: 'yt_stop' } }],
          },
        }).catch(() => {});
      } else if (nextState === 'active') {
        notifee.cancelNotification('yt_media').catch(() => {});
      }
    });
    return () => sub.remove();
  }, [activeTab?.url]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => { notifee.cancelNotification('yt_media').catch(() => {}); };
  }, []);

  // ── History ───────────────────────────────────────────────────────────────
  const addToHistoryImmed = useCallback((histUrl: string, title: string) => {
    if (!histUrl || histUrl === lastHistoryUrl.current) return;
    if (/^(about:|chrome:|data:)/.test(histUrl)) return;
    lastHistoryUrl.current = histUrl;
    const item: HistoryItem = { id: `${Date.now()}`, title: title || histUrl, url: histUrl, timestamp: Date.now() };
    const updated = [item, ...historyRef.current.filter(h => h.url !== histUrl)].slice(0, 500);
    historyRef.current = updated;
    setHistory(updated);
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated)).catch(() => {});
  }, []);

  // ── Navigation state change (per-tab) ─────────────────────────────────────
  const onNavChange = useCallback((tabId: string, nav: WebViewNavigation) => {
    updateTab(tabId, {
      canGoBack: nav.canGoBack,
      canGoForward: nav.canGoForward,
      url: nav.url,
      title: nav.title ?? '',
      loading: nav.loading,
    });
    setActiveTabId(cur => {
      if (cur === tabId) setInputText(nav.url);
      return cur;
    });
    if (!nav.loading && nav.url) addToHistoryImmed(nav.url, nav.title ?? '');
  }, [updateTab, addToHistoryImmed]);

  // ── Navigate active tab ────────────────────────────────────────────────────
  const navigate = useCallback((raw: string) => {
    Keyboard.dismiss();
    const target = normaliseUrl(raw);
    setInputText(target);
    updateTab(activeTabId, { url: target });
  }, [activeTabId, updateTab]);

  // ── Bookmarks ─────────────────────────────────────────────────────────────
  const saveBookmarks = useCallback(async (list: Bookmark[]) => {
    setBookmarks(list);
    await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list));
  }, []);

  const toggleBookmark = useCallback(async () => {
    const url = activeTab?.url ?? '';
    if (isBookmarked) {
      await saveBookmarks(bookmarks.filter(b => b.url !== url));
      ToastAndroid.show('Bookmark removed', ToastAndroid.SHORT);
    } else {
      await saveBookmarks([{ id: `${Date.now()}`, title: activeTab?.title || url, url }, ...bookmarks]);
      ToastAndroid.show('Bookmark saved', ToastAndroid.SHORT);
    }
  }, [isBookmarked, bookmarks, activeTab, saveBookmarks]);

  const deleteBookmark = useCallback(async (id: string) => {
    await saveBookmarks(bookmarks.filter(b => b.id !== id));
  }, [bookmarks, saveBookmarks]);

  const confirmDeleteBookmark = (bm: Bookmark) => {
    Alert.alert('Remove Bookmark', `"${bm.title}"`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteBookmark(bm.id) },
    ]);
  };

  // ── Downloads ─────────────────────────────────────────────────────────────
  const handleDownload = useCallback(async (downloadUrl: string) => {
    const rawName = downloadUrl.split('/').pop()?.split('?')[0] ?? `file_${Date.now()}`;
    const filename = decodeURIComponent(rawName);
    const destPath = `${RNFS.DownloadDirectoryPath}/${filename}`;
    const id = `${Date.now()}`;
    const notifId = `dl_${id}`;
    const newDl: DownloadItem = { id, filename, url: downloadUrl, status: 'downloading', progress: 0, timestamp: Date.now() };
    setDownloads(prev => {
      const next = [newDl, ...prev];
      AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    notifee.displayNotification({
      id: notifId, title: '⬇ Downloading 0%', body: filename,
      android: { channelId: 'downloads', ongoing: true, progress: { max: 100, current: 0, indeterminate: false } },
    }).catch(() => {});
    ToastAndroid.show(`⬇ Downloading ${filename}…`, ToastAndroid.SHORT);
    try {
      const result = await RNFS.downloadFile({
        fromUrl: downloadUrl,
        toFile: destPath,
        progress: res => {
          if (res.contentLength > 0) {
            const pct = res.bytesWritten / res.contentLength;
            setDownloads(prev => prev.map(d => d.id === id ? { ...d, progress: pct } : d));
            const now = Date.now();
            if (!lastNotifUpdate.current[id] || now - lastNotifUpdate.current[id] > 1500) {
              lastNotifUpdate.current[id] = now;
              notifee.displayNotification({
                id: notifId, title: `⬇ Downloading ${Math.round(pct * 100)}%`, body: filename,
                android: { channelId: 'downloads', ongoing: true, progress: { max: 100, current: Math.round(pct * 100), indeterminate: false } },
              }).catch(() => {});
            }
          }
        },
      }).promise;
      if (result.statusCode === 200) {
        // Register with Android MediaStore so the file appears in the Downloads/Files app
        await RNFS.scanFile(destPath).catch(() => {});
        setDownloads(prev => {
          const next = prev.map(d => d.id === id ? { ...d, status: 'done' as const, progress: 1, savedPath: destPath } : d);
          AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        });
        notifee.cancelNotification(notifId).catch(() => {});
        notifee.displayNotification({
          id: `${notifId}_done`,
          title: '✔ Download Complete',
          body: filename,
          android: { channelId: 'downloads', pressAction: { id: 'default' } },
        }).catch(() => {});
        ToastAndroid.show(`✔ Saved to Downloads: ${filename}`, ToastAndroid.LONG);
      } else { throw new Error(`HTTP ${result.statusCode}`); }
    } catch (err: any) {
      setDownloads(prev => {
        const next = prev.map(d => d.id === id ? { ...d, status: 'error' as const, error: String(err?.message ?? err) } : d);
        AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      notifee.cancelNotification(notifId).catch(() => {});
      notifee.displayNotification({ id: `${notifId}_err`, title: '✖ Download Failed', body: filename, android: { channelId: 'downloads' } }).catch(() => {});
      ToastAndroid.show('✖ Download failed', ToastAndroid.SHORT);
    }
    delete lastNotifUpdate.current[id];
  }, []);

  const onShouldStartLoad = useCallback((req: any) => {
    const url = req.url as string;
    // Never block YouTube, its video CDN, or its own infrastructure
    const isYouTubeDomain = /youtube\.com|youtu\.be|googlevideo\.com|ytimg\.com|yt3\.ggpht|youtubei\.googleapis/i.test(url);
    if (!isYouTubeDomain && adBlockEnabled && isAdUrl(url)) return false;
    if (DOWNLOAD_EXTS.test(url)) { handleDownload(url); return false; }
    return true;
  }, [adBlockEnabled, handleDownload]);

  // ── History actions ────────────────────────────────────────────────────────
  const clearHistory = useCallback(() => {
    Alert.alert('Clear History', 'Remove all browsing history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All', style: 'destructive', onPress: async () => {
          historyRef.current = []; lastHistoryUrl.current = '';
          setHistory([]); setHistorySearch('');
          await AsyncStorage.removeItem(HISTORY_KEY);
          ToastAndroid.show('History cleared', ToastAndroid.SHORT);
        },
      },
    ]);
  }, []);

  const deleteHistoryItem = useCallback(async (id: string) => {
    const updated = historyRef.current.filter(h => h.id !== id);
    historyRef.current = updated; setHistory(updated);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  }, []);

  // ── Open in external browser ──────────────────────────────────────────────
  const openExternal = useCallback(() => {
    Linking.openURL(activeTab?.url ?? '').catch(() => ToastAndroid.show('Cannot open browser', ToastAndroid.SHORT));
  }, [activeTab?.url]);

  // ── Ad-block toggle ───────────────────────────────────────────────────────
  const toggleAdBlock = useCallback(() => {
    setAdBlockEnabled(prev => {
      const next = !prev;
      AsyncStorage.setItem(ADBLOCK_KEY, String(next)).catch(() => {});
      ToastAndroid.show(next ? '🛡 Ad Block: ON' : '🚫 Ad Block: OFF', ToastAndroid.SHORT);
      setTimeout(() => webRefs.current[activeTabId]?.reload(), 100);
      return next;
    });
  }, [activeTabId]);

  // ── YouTube now-playing messages ──────────────────────────────────────────
  const onWebMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'yt_state') {
        const title: string = msg.title || '';
        nowPlayingRef.current = msg.paused ? '' : title;
        setNowPlayingTitle(msg.paused ? '' : title);
        if (msg.paused) notifee.cancelNotification('yt_media').catch(() => {});
      }
    } catch { }
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  const groupMenuTab    = tabs.find(t => t.id === groupMenuTabId);
  const tabInGroup      = groupMenuTab?.groupId;
  const currentGroup    = tabGroups.find(g => g.id === tabInGroup);

  return (
    <View style={styles.container}>

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
          <Text style={styles.iconBtnText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.urlBarWrap}>
          {activeTab?.loading && (
            <ActivityIndicator size="small" color="#FF6B35" style={styles.urlSpinner} />
          )}
          <TextInput
            style={styles.urlInput}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={() => navigate(inputText)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            selectTextOnFocus
            placeholderTextColor="#666"
            placeholder="Search or enter URL"
          />
          {inputText.length > 0 && (
            <TouchableOpacity style={styles.urlClear} onPress={() => setInputText('')}>
              <Text style={styles.urlClearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={toggleBookmark}>
          <Text style={[styles.iconBtnText, isBookmarked && styles.bookmarkedIcon]}>
            {isBookmarked ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab strip ── */}
      <View style={styles.tabStrip}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabStripContent}
        >
          {tabs.map(tab => {
            const grp = tab.groupId ? tabGroups.find(g => g.id === tab.groupId) : undefined;
            const isActive = tab.id === activeTabId;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.tabChip,
                  isActive && styles.tabChipActive,
                  grp ? { borderBottomColor: grp.color, borderBottomWidth: 3, borderRadius: 4 } : {},
                ]}
                onPress={() => switchTab(tab.id)}
                onLongPress={() => openGroupMenu(tab.id)}
                activeOpacity={0.7}
              >
                {grp && <View style={[styles.tabGroupDot, { backgroundColor: grp.color }]} />}
                <Text style={[styles.tabChipText, isActive && styles.tabChipTextActive]} numberOfLines={1}>
                  {tab.title || tab.url.replace(/^https?:\/\//, '').split('/')[0] || 'New Tab'}
                </Text>
                <TouchableOpacity
                  style={styles.tabCloseBtn}
                  onPress={() => closeTab(tab.id)}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                >
                  <Text style={styles.tabCloseBtnText}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.tabNewBtn} onPress={() => createTab()}>
            <Text style={styles.tabNewBtnText}>＋</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ── Progress bar ── */}
      {activeTab?.loading && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round((activeTab.progress ?? 0) * 100)}%` as any }]} />
        </View>
      )}

      {/* ── WebViews (one per tab, only active is visible) ── */}
      <View style={styles.webviewContainer}>
        {tabs.map(tab => (
          <View
            key={tab.id}
            style={tab.id === activeTabId ? styles.webviewActive : styles.webviewHidden}
          >
            <WebView
              ref={r => { webRefs.current[tab.id] = r; }}
              source={{ uri: tab.url }}
              style={styles.webview}
              onNavigationStateChange={nav => onNavChange(tab.id, nav)}
              onLoadStart={() => updateTab(tab.id, { loading: true })}
              onLoadEnd={() => updateTab(tab.id, { loading: false })}
              onLoadProgress={({ nativeEvent }) => updateTab(tab.id, { progress: nativeEvent.progress })}
              javaScriptEnabled
              domStorageEnabled
              allowsBackForwardNavigationGestures
              setSupportMultipleWindows={false}
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback
              allowsFullscreenVideo
              userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
              thirdPartyCookiesEnabled
              injectedJavaScriptBeforeContentLoaded={YOUTUBE_BG_JS}
              injectedJavaScript={(adBlockEnabled ? AD_BLOCK_JS : '') + '\n' + YOUTUBE_AD_JS}
              onMessage={onWebMessage}
              onShouldStartLoadWithRequest={onShouldStartLoad}
            />
          </View>
        ))}
      </View>

      {/* ── Bottom nav bar ── */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.navBtn, !activeTab?.canGoBack && styles.navBtnDisabled]}
          onPress={() => webRefs.current[activeTabId]?.goBack()}
          disabled={!activeTab?.canGoBack}
        >
          <Text style={[styles.navBtnText, !activeTab?.canGoBack && styles.navBtnTextDisabled]}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navBtn, !activeTab?.canGoForward && styles.navBtnDisabled]}
          onPress={() => webRefs.current[activeTabId]?.goForward()}
          disabled={!activeTab?.canGoForward}
        >
          <Text style={[styles.navBtnText, !activeTab?.canGoForward && styles.navBtnTextDisabled]}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => webRefs.current[activeTabId]?.reload()}>
          <Text style={styles.navBtnText}>⟳</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => navigate(HOME_URL)}>
          <Text style={styles.navBtnText}>⌂</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => setShowTabSwitcher(true)}>
          <View style={styles.tabCountBadge}>
            <Text style={styles.tabCountText}>{tabs.length}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => setShowMoreMenu(true)}>
          <Text style={styles.navBtnText}>⋮</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab Switcher modal ── */}
      <Modal visible={showTabSwitcher} transparent animationType="slide" onRequestClose={() => setShowTabSwitcher(false)}>
        <View style={styles.bmOverlay}>
          <TouchableOpacity style={styles.bmBackdrop} onPress={() => setShowTabSwitcher(false)} activeOpacity={1} />
          <View style={[styles.bmSheet, { maxHeight: '85%' }]}>
            <View style={styles.bmHeader}>
              <Text style={styles.bmTitle}>⬜ Tabs ({tabs.length})</Text>
              <TouchableOpacity
                style={[styles.histClearBtn, { borderColor: '#2e5a2e', backgroundColor: '#1a3a1a' }]}
                onPress={() => { createTab(); setShowTabSwitcher(false); }}
              >
                <Text style={[styles.histClearBtnText, { color: '#4ade80' }]}>＋ New Tab</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowTabSwitcher(false)} style={[styles.bmCloseBtn, { marginLeft: 8 }]}>
                <Text style={styles.bmCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Group chips row */}
            {tabGroups.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.groupChipsRow}
                contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}
              >
                {tabGroups.map(grp => {
                  const count = tabs.filter(t => t.groupId === grp.id).length;
                  return (
                    <TouchableOpacity
                      key={grp.id}
                      style={[styles.groupChip, { backgroundColor: grp.color + '33', borderColor: grp.color }]}
                      onLongPress={() => Alert.alert(`Delete group "${grp.name}"?`, `${count} tab(s) will be ungrouped.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deleteGroup(grp.id) },
                      ])}
                    >
                      <View style={[styles.tabGroupDot, { backgroundColor: grp.color }]} />
                      <Text style={[styles.groupChipText, { color: grp.color }]}>{grp.name} ({count})</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <FlatList
              data={tabs}
              keyExtractor={t => t.id}
              renderItem={({ item: t }) => {
                const grp = t.groupId ? tabGroups.find(g => g.id === t.groupId) : undefined;
                const isActive = t.id === activeTabId;
                return (
                  <TouchableOpacity
                    style={[styles.switcherTab, isActive && styles.switcherTabActive]}
                    onPress={() => { switchTab(t.id); setShowTabSwitcher(false); }}
                    onLongPress={() => { setShowTabSwitcher(false); openGroupMenu(t.id); }}
                  >
                    <View style={{ flex: 1 }}>
                      {grp && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                          <View style={[styles.tabGroupDot, { backgroundColor: grp.color, marginRight: 4 }]} />
                          <Text style={[styles.groupChipText, { color: grp.color, fontSize: 10 }]}>{grp.name}</Text>
                        </View>
                      )}
                      <Text style={[styles.bmItemTitle, isActive && { color: '#FF6B35' }]} numberOfLines={1}>
                        {t.title || 'New Tab'}
                      </Text>
                      <Text style={styles.bmItemUrl} numberOfLines={1}>{t.url}</Text>
                    </View>
                    {t.loading && <ActivityIndicator size="small" color="#FF6B35" style={{ marginHorizontal: 8 }} />}
                    <TouchableOpacity style={styles.bmDeleteBtn} onPress={() => closeTab(t.id)}>
                      <Text style={styles.bmDeleteBtnText}>🗑</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ── Tab Group menu modal ── */}
      <Modal visible={showGroupMenu} transparent animationType="fade" onRequestClose={() => setShowGroupMenu(false)}>
        <TouchableOpacity style={styles.menuOverlay} onPress={() => setShowGroupMenu(false)} activeOpacity={1}>
          <View style={[styles.menuSheet, { padding: 16, overflow: 'visible' }]}>
            <Text style={[styles.bmTitle, { marginBottom: 12 }]}>🏷 Tab Group</Text>

            {tabInGroup && currentGroup ? (
              <>
                <Text style={[styles.bmItemUrl, { marginBottom: 12 }]}>
                  Currently in: <Text style={{ color: currentGroup.color }}>● {currentGroup.name}</Text>
                </Text>
                {tabGroups.filter(g => g.id !== tabInGroup).map(g => (
                  <TouchableOpacity key={g.id} style={styles.menuItem} onPress={() => { assignGroup(groupMenuTabId, g.id); setShowGroupMenu(false); }}>
                    <View style={[styles.tabGroupDot, { backgroundColor: g.color, marginRight: 14, width: 12, height: 12, borderRadius: 6 }]} />
                    <Text style={styles.menuLabel}>Move to "{g.name}"</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.menuItem} onPress={() => { assignGroup(groupMenuTabId, undefined); setShowGroupMenu(false); }}>
                  <Text style={styles.menuIcon}>✖</Text>
                  <Text style={[styles.menuLabel, { color: '#f87171' }]}>Remove from group</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {tabGroups.length > 0 && (
                  <>
                    <Text style={[styles.bmItemUrl, { marginBottom: 6 }]}>Add to existing group:</Text>
                    {tabGroups.map(g => (
                      <TouchableOpacity key={g.id} style={styles.menuItem} onPress={() => { assignGroup(groupMenuTabId, g.id); setShowGroupMenu(false); }}>
                        <View style={[styles.tabGroupDot, { backgroundColor: g.color, marginRight: 14, width: 12, height: 12, borderRadius: 6 }]} />
                        <Text style={styles.menuLabel}>{g.name}</Text>
                      </TouchableOpacity>
                    ))}
                    <View style={styles.menuDivider} />
                  </>
                )}
                <Text style={[styles.bmItemUrl, { marginBottom: 8 }]}>Create new group:</Text>
                <TextInput
                  style={styles.histSearchInput}
                  value={newGroupName}
                  onChangeText={setNewGroupName}
                  placeholder="Group name…"
                  placeholderTextColor="#555"
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginBottom: 12 }}>
                  {GROUP_COLORS.map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setNewGroupColor(c)}
                      style={[styles.colorSwatch, { backgroundColor: c, borderWidth: c === newGroupColor ? 3 : 0, borderColor: '#fff' }]}
                    />
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={[styles.histClearBtn, { borderColor: '#555', backgroundColor: '#2a2a2a', alignItems: 'center', paddingVertical: 8 }]}
                  onPress={() => {
                    if (!newGroupName.trim()) { ToastAndroid.show('Enter a group name', ToastAndroid.SHORT); return; }
                    createGroup(newGroupName.trim(), newGroupColor, groupMenuTabId);
                    setShowGroupMenu(false);
                  }}
                >
                  <Text style={[styles.histClearBtnText, { color: '#fff' }]}>Create Group</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Bookmarks modal ── */}
      <Modal visible={showBookmarks} transparent animationType="slide" onRequestClose={() => setShowBookmarks(false)}>
        <View style={styles.bmOverlay}>
          <TouchableOpacity style={styles.bmBackdrop} onPress={() => setShowBookmarks(false)} activeOpacity={1} />
          <View style={styles.bmSheet}>
            <View style={styles.bmHeader}>
              <Text style={styles.bmTitle}>☰ Bookmarks</Text>
              <TouchableOpacity onPress={() => setShowBookmarks(false)} style={styles.bmCloseBtn}>
                <Text style={styles.bmCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            {bookmarks.length === 0 ? (
              <View style={styles.bmEmpty}>
                <Text style={styles.bmEmptyText}>No bookmarks yet.</Text>
                <Text style={styles.bmEmptyHint}>Tap ☆ in the address bar to save a page.</Text>
              </View>
            ) : (
              <FlatList
                data={bookmarks}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.bmItem}
                    onPress={() => { navigate(item.url); setShowBookmarks(false); }}
                    onLongPress={() => confirmDeleteBookmark(item)}
                  >
                    <View style={styles.bmItemInfo}>
                      <Text style={styles.bmItemTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.bmItemUrl} numberOfLines={1}>{item.url}</Text>
                    </View>
                    <TouchableOpacity style={styles.bmDeleteBtn} onPress={() => confirmDeleteBookmark(item)}>
                      <Text style={styles.bmDeleteBtnText}>🗑</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── History modal ── */}
      <Modal visible={showHistory} transparent animationType="slide" onRequestClose={() => setShowHistory(false)}>
        <View style={styles.bmOverlay}>
          <TouchableOpacity style={styles.bmBackdrop} onPress={() => setShowHistory(false)} activeOpacity={1} />
          <View style={styles.bmSheet}>
            <View style={styles.bmHeader}>
              <Text style={styles.bmTitle}>🕐 History</Text>
              <TouchableOpacity onPress={clearHistory} style={styles.histClearBtn}>
                <Text style={styles.histClearBtnText}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowHistory(false)} style={styles.histCloseBtn}>
                <Text style={styles.bmCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.histSearchWrap}>
              <TextInput
                style={styles.histSearchInput}
                placeholder="Search history…"
                placeholderTextColor="#555"
                value={historySearch}
                onChangeText={setHistorySearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {history.length === 0 ? (
              <View style={styles.bmEmpty}><Text style={styles.bmEmptyText}>No history yet.</Text></View>
            ) : (
              <FlatList
                data={history.filter(h =>
                  !historySearch ||
                  h.title.toLowerCase().includes(historySearch.toLowerCase()) ||
                  h.url.toLowerCase().includes(historySearch.toLowerCase()),
                )}
                keyExtractor={item => item.id}
                renderItem={({ item }) => {
                  const d = new Date(item.timestamp);
                  const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <TouchableOpacity
                      style={styles.bmItem}
                      onPress={() => { navigate(item.url); setShowHistory(false); }}
                      onLongPress={() => Alert.alert('Remove', `"${item.title}"`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => deleteHistoryItem(item.id) },
                      ])}
                    >
                      <View style={styles.bmItemInfo}>
                        <Text style={styles.bmItemTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.bmItemUrl} numberOfLines={1}>{item.url}</Text>
                        <Text style={styles.histItemDate}>{dateStr}</Text>
                      </View>
                      <TouchableOpacity style={styles.bmDeleteBtn} onPress={() => deleteHistoryItem(item.id)}>
                        <Text style={styles.bmDeleteBtnText}>🗑</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── Downloads modal ── */}
      <Modal visible={showDownloads} transparent animationType="slide" onRequestClose={() => setShowDownloads(false)}>
        <View style={styles.bmOverlay}>
          <TouchableOpacity style={styles.bmBackdrop} onPress={() => setShowDownloads(false)} activeOpacity={1} />
          <View style={styles.bmSheet}>
            <View style={styles.bmHeader}>
              <Text style={styles.bmTitle}>⬇ Downloads</Text>
              <TouchableOpacity onPress={() => setShowDownloads(false)} style={styles.bmCloseBtn}>
                <Text style={styles.bmCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            {downloads.length === 0 ? (
              <View style={styles.bmEmpty}>
                <Text style={styles.bmEmptyText}>No downloads yet.</Text>
                <Text style={styles.bmEmptyHint}>Links to files (PDF, ZIP, APK…) are downloaded automatically.</Text>
              </View>
            ) : (
              <FlatList
                data={downloads}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <View style={styles.dlItem}>
                    <View style={styles.dlInfo}>
                      <Text style={styles.dlName} numberOfLines={1}>{item.filename}</Text>
                      {item.status === 'downloading' && (
                        <View style={styles.dlProgressTrack}>
                          <View style={[styles.dlProgressFill, { width: `${Math.round(item.progress * 100)}%` as any }]} />
                        </View>
                      )}
                      <Text style={[
                        styles.dlStatus,
                        item.status === 'done' && styles.dlStatusDone,
                        item.status === 'error' && styles.dlStatusError,
                      ]}>
                        {item.status === 'downloading'
                          ? `${Math.round(item.progress * 100)}%`
                          : item.status === 'done'
                            ? `✔ Saved to Downloads`
                            : `✖ ${item.error ?? 'Failed'}`}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.bmDeleteBtn}
                      onPress={() => setDownloads(prev => prev.filter(d => d.id !== item.id))}
                    >
                      <Text style={styles.bmDeleteBtnText}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── More menu ── */}
      <Modal visible={showMoreMenu} transparent animationType="fade" onRequestClose={() => setShowMoreMenu(false)}>
        <TouchableOpacity style={styles.menuOverlay} onPress={() => setShowMoreMenu(false)} activeOpacity={1}>
          <View style={styles.menuSheet}>
            {([
              { icon: '★',  label: 'Bookmarks', action: () => { setShowMoreMenu(false); setShowBookmarks(true); } },
              { icon: '🕐', label: 'History',   action: () => { setShowMoreMenu(false); setShowHistory(true); } },
              { icon: '⬇',  label: 'Downloads', action: () => { setShowMoreMenu(false); setShowDownloads(true); } },
              { icon: adBlockEnabled ? '🛡' : '🚫', label: adBlockEnabled ? 'Ad Block: ON  (tap to disable)' : 'Ad Block: OFF  (tap to enable)', action: () => { setShowMoreMenu(false); toggleAdBlock(); } },
              { icon: '🌐', label: 'Open in external browser (Google sign-in)', action: () => { setShowMoreMenu(false); openExternal(); } },
            ] as { icon: string; label: string; action: () => void }[]).map(item => (
              <TouchableOpacity key={item.label} style={styles.menuItem} onPress={item.action}>
                <Text style={styles.menuIcon}>{item.icon}</Text>
                <Text style={styles.menuLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },

  // ── Top bar ──────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    gap: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
  },
  iconBtnText: { color: '#ccc', fontSize: 16, fontWeight: 'bold' },
  bookmarkedIcon: { color: '#FFD700' },
  urlBarWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    paddingHorizontal: 10,
    height: 38,
  },
  urlSpinner: { marginRight: 6 },
  urlInput: { flex: 1, color: '#fff', fontSize: 13, paddingVertical: 0 },
  urlClear: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  urlClearText: { color: '#666', fontSize: 11, fontWeight: 'bold' },

  // ── Tab strip ─────────────────────────────────────────────────────────────
  tabStrip: {
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    height: 38,
  },
  tabStripContent: {
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 4,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: 140,
    minWidth: 70,
  },
  tabChipActive: {
    backgroundColor: '#2d2d2d',
    borderWidth: 1,
    borderColor: '#FF6B35',
  },
  tabGroupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  tabChipText: { color: '#888', fontSize: 11, flex: 1 },
  tabChipTextActive: { color: '#fff' },
  tabCloseBtn: {
    marginLeft: 4,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabCloseBtnText: { color: '#555', fontSize: 10, fontWeight: 'bold' },
  tabNewBtn: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e1e1e',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
  },
  tabNewBtnText: { color: '#aaa', fontSize: 16, lineHeight: 20 },

  // ── Progress ──────────────────────────────────────────────────────────────
  progressTrack: { height: 2, backgroundColor: '#222' },
  progressFill: { height: 2, backgroundColor: '#FF6B35' },

  // ── WebView ───────────────────────────────────────────────────────────────
  webviewContainer: { flex: 1 },
  webviewActive: { flex: 1 },
  webviewHidden: {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
  webview: { flex: 1, backgroundColor: '#fff' },

  // ── Bottom nav ────────────────────────────────────────────────────────────
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  navBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
  },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { color: '#fff', fontSize: 20, fontWeight: '300' },
  navBtnTextDisabled: { color: '#555' },
  tabCountBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabCountText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  // ── Shared sheet ──────────────────────────────────────────────────────────
  bmOverlay: { flex: 1, justifyContent: 'flex-end' },
  bmBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  bmSheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  bmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d2d',
  },
  bmTitle: { flex: 1, color: '#fff', fontSize: 16, fontWeight: 'bold' },
  bmCloseBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    borderRadius: 14,
  },
  bmCloseBtnText: { color: '#aaa', fontSize: 12, fontWeight: 'bold' },
  bmEmpty: { padding: 32, alignItems: 'center' },
  bmEmptyText: { color: '#888', fontSize: 15, marginBottom: 8 },
  bmEmptyHint: { color: '#555', fontSize: 12, textAlign: 'center' },
  bmItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  bmItemInfo: { flex: 1, marginRight: 8 },
  bmItemTitle: { color: '#eee', fontSize: 14, fontWeight: '500', marginBottom: 2 },
  bmItemUrl: { color: '#555', fontSize: 11 },
  bmDeleteBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  bmDeleteBtnText: { fontSize: 16 },

  // ── History ──────────────────────────────────────────────────────────────
  histClearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#3a1a1a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#6b2b2b',
  },
  histClearBtnText: { color: '#e05252', fontSize: 12 },
  histCloseBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    borderRadius: 14,
    marginLeft: 8,
  },
  histSearchWrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  histSearchInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 13,
  },
  histItemDate: { color: '#444', fontSize: 10, marginTop: 2 },

  // ── Downloads ────────────────────────────────────────────────────────────
  dlItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  dlInfo: { flex: 1, marginRight: 8 },
  dlName: { color: '#eee', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  dlProgressTrack: {
    height: 3,
    backgroundColor: '#333',
    borderRadius: 2,
    marginBottom: 4,
    overflow: 'hidden',
  },
  dlProgressFill: { height: 3, backgroundColor: '#FF6B35', borderRadius: 2 },
  dlStatus: { color: '#777', fontSize: 11 },
  dlStatusDone: { color: '#4ade80' },
  dlStatusError: { color: '#f87171' },

  // ── More menu ─────────────────────────────────────────────────────────────
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    paddingBottom: 70,
    paddingHorizontal: 12,
  },
  menuSheet: { backgroundColor: '#1e1e1e', borderRadius: 14, overflow: 'hidden' },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d2d',
  },
  menuIcon: { fontSize: 18, marginRight: 14, width: 24, textAlign: 'center' },
  menuLabel: { color: '#fff', fontSize: 14 },
  menuDivider: { height: 1, backgroundColor: '#2d2d2d', marginVertical: 8 },

  // ── Tab switcher ──────────────────────────────────────────────────────────
  switcherTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  switcherTabActive: { backgroundColor: '#1e2a1e' },

  // ── Tab groups ────────────────────────────────────────────────────────────
  groupChipsRow: { maxHeight: 50 },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  groupChipText: { fontSize: 12, fontWeight: '500' },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginHorizontal: 4,
  },
});

export default BrowserScreen;

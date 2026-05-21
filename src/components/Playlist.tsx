import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  FlatList,
} from 'react-native';
import { VideoItem, PlaylistItem } from '../types/video';
import VideoPlayer from './VideoPlayer';

interface PlaylistProps {
  playlist: PlaylistItem;
}

const PlaylistComponent = ({ playlist }: PlaylistProps) => {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [, setLoadedInfo] = useState<{ [key: string]: string }>({});

  const currentVideo = playlist.videos[currentVideoIndex];

  const handleNextVideo = () => {
    if (currentVideoIndex < playlist.videos.length - 1) {
      setCurrentVideoIndex(currentVideoIndex + 1);
    }
  };

  const handlePreviousVideo = () => {
    if (currentVideoIndex > 0) {
      setCurrentVideoIndex(currentVideoIndex - 1);
    }
  };

  const handleVideoSelect = (index: number) => {
    setCurrentVideoIndex(index);
    setShowPlaylist(false);
  };

  const renderPlaylistItem = ({ item, index }: { item: VideoItem; index: number }) => (
    <TouchableOpacity
      style={[
        styles.playlistItem,
        currentVideoIndex === index && styles.playlistItemActive,
      ]}
      onPress={() => handleVideoSelect(index)}
    >
      <View style={styles.itemContent}>
        <Text
          style={[
            styles.itemIndex,
            currentVideoIndex === index && styles.itemIndexActive,
          ]}
        >
          {index + 1}
        </Text>
        <View style={styles.itemTextContainer}>
          <Text
            style={[
              styles.itemTitle,
              currentVideoIndex === index && styles.itemTitleActive,
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={styles.itemDuration}>
            {item.duration ? `${Math.floor(item.duration / 60)}:${(item.duration % 60).toString().padStart(2, '0')}` : 'Unknown'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Main Video Player */}
      <View style={styles.playerContainer}>
        {currentVideo && (
          <VideoPlayer
            video={currentVideo}
            onLoadComplete={() => {
              setLoadedInfo((prev: Record<string, string>) => ({
                ...prev,
                [currentVideo.id]: 'Loaded',
              }));
            }}
            onError={(error: any) => {
              setLoadedInfo((prev: Record<string, string>) => ({
                ...prev,
                [currentVideo.id]: `Error: ${error}`,
              }));
            }}
          />
        )}
      </View>

      {/* Video Navigation */}
      <View style={styles.navigationContainer}>
        <TouchableOpacity
          onPress={handlePreviousVideo}
          disabled={currentVideoIndex === 0}
          style={[
            styles.navButton,
            currentVideoIndex === 0 && styles.navButtonDisabled,
          ]}
        >
          <Text style={styles.navButtonText}>← Previous</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowPlaylist(!showPlaylist)}
          style={styles.playlistToggleButton}
        >
          <Text style={styles.playlistToggleText}>
            📋 Playlist ({currentVideoIndex + 1}/{playlist.videos.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleNextVideo}
          disabled={currentVideoIndex === playlist.videos.length - 1}
          style={[
            styles.navButton,
            currentVideoIndex === playlist.videos.length - 1 && styles.navButtonDisabled,
          ]}
        >
          <Text style={styles.navButtonText}>Next →</Text>
        </TouchableOpacity>
      </View>

      {/* Playlist View */}
      {showPlaylist && (
        <View style={styles.playlistContainer}>
          <View style={styles.playlistHeader}>
            <Text style={styles.playlistTitle}>{playlist.title}</Text>
            <TouchableOpacity onPress={() => setShowPlaylist(false)}>
              <Text style={styles.playlistCloseButton}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={playlist.videos}
            renderItem={renderPlaylistItem}
            keyExtractor={(item: VideoItem) => item.id}
            style={styles.playlistList}
            scrollEnabled={true}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  playerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  navigationContainer: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#2a2a2a',
    gap: 10,
  },
  navButton: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#FF6B35',
    borderRadius: 6,
    flex: 0.25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonDisabled: {
    backgroundColor: '#999',
    opacity: 0.5,
  },
  navButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  playlistToggleButton: {
    flex: 1,
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#FF6B35',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistToggleText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  playlistContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    zIndex: 100,
  },
  playlistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    backgroundColor: '#0d0d0d',
  },
  playlistTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  playlistCloseButton: {
    fontSize: 20,
    color: '#FF6B35',
  },
  playlistList: {
    flex: 1,
  },
  playlistItem: {
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    backgroundColor: '#1a1a1a',
  },
  playlistItemActive: {
    backgroundColor: 'rgba(255, 107, 53, 0.2)',
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B35',
    paddingLeft: 11,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemIndex: {
    color: '#666',
    fontSize: 14,
    fontWeight: 'bold',
    minWidth: 24,
  },
  itemIndexActive: {
    color: '#FF6B35',
  },
  itemTextContainer: {
    flex: 1,
  },
  itemTitle: {
    color: '#ccc',
    fontSize: 14,
  },
  itemTitleActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  itemDuration: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
});

export default PlaylistComponent;

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { DEMO_ROUTE } from '@storage/index';
import { makeId, type VideoId } from '@domain/models';

import { useAppStore } from '../store/appStore';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/RootNavigator';

/**
 * Flow A — upload an existing video from the photo library.
 *
 * We extract a thumbnail immediately so downstream UI can show it
 * while analysis is running.
 */
export function UploadScreen(): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const setDraft = useAppStore((s) => s.setDraft);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const pick = useCallback(async () => {
    setBusy(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
      });
      if (res.canceled || !res.assets[0]) return;
      const asset = res.assets[0];
      let thumb: string | undefined;
      try {
        const t = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 500 });
        thumb = t.uri;
      } catch {
        // thumbnail is best-effort
      }
      setDraft({
        video: {
          id: makeId<'Video'>(`vid_${Date.now().toString(36)}`) as VideoId,
          uri: asset.uri,
          durationMs: asset.duration ?? 6000,
          widthPx: asset.width ?? 1080,
          heightPx: asset.height ?? 1920,
          fps: 30,
          thumbnailUri: thumb,
        },
        route: { ...DEMO_ROUTE, holds: [], sequence: [] },
      });
      nav.navigate('HoldTag');
    } finally {
      setBusy(false);
    }
  }, [nav, setDraft]);

  return (
    <View style={styles.root}>
      <Text style={typography.title}>Upload a climbing video</Text>
      <Text style={[typography.body, { color: colors.textDim, marginTop: spacing.s }]}>
        Pick a clip from your library. You&apos;ll tag the holds next, then the
        pose + coaching pipeline will run locally.
      </Text>
      <Pressable style={styles.primaryBtn} onPress={pick} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <Text style={styles.primaryBtnLabel}>Choose video</Text>
        )}
      </Pressable>
      <View style={styles.hint}>
        <Text style={[typography.label, { color: colors.textDim }]}>
          Heads up: on Expo Go we run the seeded pose provider so the app is
          fully demoable. With a dev build we swap in real MoveNet inference —
          see docs/ARCHITECTURE.md.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.l,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.l,
    borderRadius: radius.pill,
  },
  primaryBtnLabel: { color: colors.bg, fontWeight: '700', fontSize: 16 },
  hint: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    padding: spacing.m,
    backgroundColor: colors.bgCard,
  },
});

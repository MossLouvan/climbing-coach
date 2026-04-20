import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { DEMO_ROUTE } from '@storage/index';
import { makeId, type VideoId } from '@domain/models';

import { useAppStore } from '../store/appStore';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/RootNavigator';

/**
 * Flow B — live recording.
 *
 * The screen is intentionally thin:
 *   1. ask for camera permission if needed
 *   2. record a clip with CameraView.recordAsync()
 *   3. save locally via expo-file-system
 *   4. stuff the result into `draft` and jump to HoldTag
 *
 * We do NOT try to run pose inference live on-device in V1 — that
 * requires a dev build + a real tfjs pipeline. The pipeline handles
 * the recorded file after tagging, same as uploads.
 */
export function RecordScreen(): React.ReactElement {
  const [permission, requestPermission] = useCameraPermissions();
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const setDraft = useAppStore((s) => s.setDraft);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const toggle = useCallback(async () => {
    const cam = cameraRef.current;
    if (!cam) return;
    if (recording) {
      cam.stopRecording();
      setRecording(false);
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRecording(true);
    try {
      const rec = await cam.recordAsync({ maxDuration: 30 });
      if (!rec?.uri) throw new Error('No recording URI');
      setSaving(true);
      const dest = `${FileSystem.documentDirectory}sessions/${Date.now()}.mov`;
      await FileSystem.makeDirectoryAsync(
        `${FileSystem.documentDirectory}sessions`,
        { intermediates: true },
      ).catch(() => undefined);
      await FileSystem.copyAsync({ from: rec.uri, to: dest });
      setDraft({
        video: {
          id: makeId<'Video'>(`vid_${Date.now().toString(36)}`) as VideoId,
          uri: dest,
          durationMs: 30000,
          widthPx: 1080,
          heightPx: 1920,
          fps: 30,
        },
        route: { ...DEMO_ROUTE, holds: [], sequence: [] },
      });
      nav.navigate('HoldTag');
    } catch {
      setRecording(false);
    } finally {
      setSaving(false);
    }
  }, [recording, setDraft, nav]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={typography.body}>
          Camera access is required to record climbing attempts.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnLabel}>Grant camera access</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        mode="video"
        facing="back"
        videoQuality="1080p"
      />
      <View style={styles.controls}>
        <Text style={[typography.label, { color: colors.text }]}>
          {recording ? 'Recording…' : 'Record a climbing attempt'}
        </Text>
        <Pressable onPress={toggle} style={[styles.shutter, recording && styles.shutterActive]}>
          <View style={[styles.shutterInner, recording && styles.shutterInnerActive]} />
        </Pressable>
        {saving && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s }}>
            <ActivityIndicator color={colors.accent} />
            <Text style={typography.label}>Saving…</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'black' },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.m,
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.m,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterActive: { borderColor: colors.bad },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.bad,
  },
  shutterInnerActive: { borderRadius: 8, width: 32, height: 32 },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.m,
    borderRadius: radius.pill,
  },
  primaryBtnLabel: { color: colors.bg, fontWeight: '700' },
});

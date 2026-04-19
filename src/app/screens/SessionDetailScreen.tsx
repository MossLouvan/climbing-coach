import { useRoute, type RouteProp } from '@react-navigation/native';
import { Video as ExpoVideo, ResizeMode } from 'expo-av';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { PoseOverlay } from '@viz/overlay2d/PoseOverlay';
import { Skeleton3D } from '@viz/skeleton3d/Skeleton3D';
import {
  type Pose2D,
  type Pose3D,
  type Session,
} from '@domain/models';

import { useAppStore } from '../store/appStore';
import { colors, radius, scoreColor, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/RootNavigator';

type SessionDetailRoute = RouteProp<RootStackParamList, 'SessionDetail'>;

/**
 * The main analysis surface:
 *   - video preview with 2D pose overlay (scrubs with video time)
 *   - 3D skeleton + stylized capsule mesh in a separate panel
 *   - phase timeline with per-phase scores
 *   - coaching tips
 *
 * Playback and the overlays share a single current-frame index. When
 * the user scrubs the phase timeline, we seek the video to the phase
 * start. When the video plays, we look up the nearest pose frame.
 */
export function SessionDetailScreen(): React.ReactElement {
  const route = useRoute<SessionDetailRoute>();
  const repos = useAppStore((s) => s.repos);
  const [session, setSession] = useState<Session | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const videoRef = useRef<ExpoVideo>(null);
  const { width } = useWindowDimensions();

  useEffect(() => {
    void (async () => {
      if (!repos) return;
      const s = await repos.sessions.get(route.params.sessionId);
      setSession(s);
    })();
  }, [repos, route.params.sessionId]);

  const currentPose2D: Pose2D | null = useMemo(() => {
    if (!session?.poseTrack) return null;
    return nearestByTimestamp(session.poseTrack.poses2D, positionMs);
  }, [session, positionMs]);
  const currentPose3D: Pose3D | null = useMemo(() => {
    if (!session?.poseTrack) return null;
    return nearestByTimestamp(session.poseTrack.poses3D, positionMs);
  }, [session, positionMs]);

  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={typography.body}>Loading session…</Text>
      </View>
    );
  }

  const report = session.report;
  const videoAspect = session.video.heightPx
    ? session.video.widthPx / session.video.heightPx
    : 9 / 16;

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      <View style={{ width, aspectRatio: videoAspect, backgroundColor: 'black' }}>
        {session.note === 'demo-seed' ? (
          <View style={[StyleSheet.absoluteFill, styles.demoFrame]}>
            <Text style={[typography.label, { color: colors.textDim }]}>
              Demo session — seeded motion
            </Text>
          </View>
        ) : (
          <ExpoVideo
            ref={videoRef}
            source={{ uri: session.video.uri }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping
            onPlaybackStatusUpdate={(s) => {
              if ('positionMillis' in s && typeof s.positionMillis === 'number') {
                setPositionMs(s.positionMillis);
              }
            }}
          />
        )}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <PoseOverlay pose={currentPose2D} holds={session.poseTrack ? [] : []} />
        </View>
      </View>

      <View style={{ height: 320, marginTop: spacing.m }}>
        <Skeleton3D pose={currentPose3D} showMesh autoRotate />
      </View>

      {report && (
        <View style={styles.section}>
          <View style={styles.overallRow}>
            <Text style={typography.title}>Technique</Text>
            <Text style={[typography.title, { color: scoreColor(report.overall) }]}>
              {Math.round(report.overall)}
            </Text>
          </View>
          <View style={styles.categoryGrid}>
            {Object.entries(report.byCategory).map(([cat, sc]) => (
              <View key={cat} style={styles.catCell}>
                <Text style={typography.label}>{cat.replace(/_/g, ' ')}</Text>
                <Text style={[typography.subtitle, { color: scoreColor(sc) }]}>
                  {Math.round(sc)}
                </Text>
              </View>
            ))}
          </View>
          {report.caveats.length > 0 && (
            <View style={styles.caveats}>
              {report.caveats.map((c, i) => (
                <Text key={i} style={[typography.label, { color: colors.warn }]}>
                  · {c}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {session.phases && session.phases.length > 0 && (
        <View style={styles.section}>
          <Text style={typography.subtitle}>Phase timeline</Text>
          <View style={{ flexDirection: 'row', marginTop: spacing.s, height: 28 }}>
            {session.phases.map((p, i) => {
              const total = session.phases![session.phases!.length - 1].endMs || 1;
              const w = Math.max(2, ((p.endMs - p.startMs) / total) * (width - spacing.l * 2));
              return (
                <Pressable
                  key={i}
                  onPress={() => setPositionMs(p.startMs)}
                  style={{
                    width: w,
                    backgroundColor: phaseColor(p.kind),
                    marginRight: 1,
                    borderRadius: 4,
                  }}
                />
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.s }}>
            {report?.phaseScores.map((ps, i) => (
              <View key={i} style={styles.phaseChip}>
                <Text style={typography.label}>{ps.kind}</Text>
                <Text style={[typography.body, { color: scoreColor(ps.overall) }]}>
                  {Math.round(ps.overall)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {report && report.tips.length > 0 && (
        <View style={styles.section}>
          <Text style={typography.subtitle}>Coaching tips</Text>
          {report.tips.map((tip, i) => (
            <View key={i} style={styles.tip}>
              <View
                style={[
                  styles.tipBadge,
                  {
                    backgroundColor:
                      tip.severity === 'warning'
                        ? colors.bad
                        : tip.severity === 'suggestion'
                          ? colors.warn
                          : colors.accent,
                  },
                ]}
              >
                <Text style={{ color: colors.bg, fontWeight: '700' }}>
                  {tip.category}
                </Text>
              </View>
              <Text style={[typography.body, { flex: 1 }]}>{tip.message}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function nearestByTimestamp<T extends { timestampMs: number }>(
  arr: ReadonlyArray<T>,
  t: number,
): T | null {
  if (arr.length === 0) return null;
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].timestampMs < t) lo = mid + 1;
    else hi = mid;
  }
  return arr[lo];
}

function phaseColor(kind: string): string {
  switch (kind) {
    case 'setup':
      return '#4B5563';
    case 'weight_shift':
      return '#60A5FA';
    case 'reach':
      return '#4ADE80';
    case 'dyno':
      return '#F87171';
    case 'match':
      return '#FACC15';
    case 'flag':
      return '#A78BFA';
    case 'rest':
      return '#94A3B8';
    default:
      return colors.border;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  section: {
    backgroundColor: colors.bgCard,
    margin: spacing.l,
    padding: spacing.l,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.s,
  },
  overallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
    marginTop: spacing.s,
  },
  catCell: {
    minWidth: 120,
    padding: spacing.s,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  caveats: {
    marginTop: spacing.s,
    padding: spacing.s,
    borderRadius: radius.m,
    backgroundColor: colors.bgElevated,
    gap: spacing.xs,
  },
  phaseChip: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    backgroundColor: colors.bgElevated,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s,
    padding: spacing.s,
    borderRadius: radius.m,
    backgroundColor: colors.bgElevated,
    marginTop: spacing.s,
  },
  tipBadge: {
    paddingHorizontal: spacing.s,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
});

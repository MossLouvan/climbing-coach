import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { ComPathOverlay } from '@viz/overlay2d/ComPathOverlay';
import { PoseOverlay } from '@viz/overlay2d/PoseOverlay';
import { type Pose2D, type Session } from '@domain/models';

import { useAppStore } from '../store/appStore';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/RootNavigator';

type CompareRoute = RouteProp<RootStackParamList, 'Compare'>;

/**
 * Side-by-side playback of two sessions. A shared 0..1 scrubber maps
 * onto each clip's duration so the two videos progress at the same
 * normalized phase. Each video gets a minimal overlay (2D skeleton +
 * CoM trail); other overlays are intentionally left out to keep the
 * comparison surface legible.
 */
export function CompareScreen(): React.ReactElement {
  const route = useRoute<CompareRoute>();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const repos = useAppStore((s) => s.repos);
  const { width } = useWindowDimensions();

  const [sessionA, setSessionA] = useState<Session | null>(null);
  const [sessionB, setSessionB] = useState<Session | null>(null);
  const [candidates, setCandidates] = useState<ReadonlyArray<Session>>([]);
  const [progress, setProgress] = useState(0); // normalized 0..1

  useEffect(() => {
    void (async () => {
      if (!repos) return;
      const a = await repos.sessions.get(route.params.a);
      setSessionA(a);
      if (route.params.b) {
        const b = await repos.sessions.get(route.params.b);
        setSessionB(b);
      } else {
        setSessionB(null);
      }
    })();
  }, [repos, route.params.a, route.params.b]);

  // When no `b` was passed, offer a picker of other sessions on the
  // same route (most climbers compare attempts on the same problem).
  useEffect(() => {
    void (async () => {
      if (!repos || !sessionA || sessionB || route.params.b) return;
      const all = await repos.sessions.listByUser(sessionA.userId);
      setCandidates(
        all.filter((s) => s.id !== sessionA.id && s.routeId === sessionA.routeId),
      );
    })();
  }, [repos, sessionA, sessionB, route.params.b]);

  const videoUriA = useMemo(
    () => (sessionA && sessionA.note !== 'demo-seed' ? sessionA.video.uri : null),
    [sessionA],
  );
  const videoUriB = useMemo(
    () => (sessionB && sessionB.note !== 'demo-seed' ? sessionB.video.uri : null),
    [sessionB],
  );

  const playerA = useVideoPlayer(videoUriA, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.1;
    p.play();
  });
  const playerB = useVideoPlayer(videoUriB, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.1;
    p.play();
  });

  // Duration-based sync: progress 0..1 → position in each clip.
  const durationA = sessionA?.video.durationMs ?? 0;
  const durationB = sessionB?.video.durationMs ?? 0;

  const [positionAMs, setPositionAMs] = useState(0);
  const [positionBMs, setPositionBMs] = useState(0);

  useEffect(() => {
    if (!playerA) return;
    const sub = playerA.addListener('timeUpdate', (e) => {
      setPositionAMs(Math.round((e.currentTime ?? 0) * 1000));
    });
    return () => sub.remove();
  }, [playerA]);
  useEffect(() => {
    if (!playerB) return;
    const sub = playerB.addListener('timeUpdate', (e) => {
      setPositionBMs(Math.round((e.currentTime ?? 0) * 1000));
    });
    return () => sub.remove();
  }, [playerB]);

  const scrubTo = (t: number): void => {
    const clamped = Math.max(0, Math.min(1, t));
    setProgress(clamped);
    if (playerA && durationA > 0) {
      const secs = (clamped * durationA) / 1000;
      playerA.currentTime = secs;
      setPositionAMs(Math.round(secs * 1000));
    }
    if (playerB && durationB > 0) {
      const secs = (clamped * durationB) / 1000;
      playerB.currentTime = secs;
      setPositionBMs(Math.round(secs * 1000));
    }
  };

  const currentPoseA = useMemo(
    () => (sessionA ? nearestByTimestamp(sessionA.poseTrack?.poses2D, positionAMs) : null),
    [sessionA, positionAMs],
  );
  const currentPoseB = useMemo(
    () => (sessionB ? nearestByTimestamp(sessionB.poseTrack?.poses2D, positionBMs) : null),
    [sessionB, positionBMs],
  );

  if (!sessionA) {
    return (
      <View style={styles.center}>
        <Text style={typography.body}>Loading…</Text>
      </View>
    );
  }

  if (!sessionB) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.l }}>
        <Text style={typography.subtitle}>Pick a second attempt on this route</Text>
        <Text style={[typography.label, { marginBottom: spacing.m }]}>
          {candidates.length === 0
            ? 'No other sessions found on this route.'
            : `${candidates.length} attempt(s) available`}
        </Text>
        {candidates.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => navigation.setParams({ a: sessionA.id, b: c.id })}
            style={styles.candidate}
          >
            <Text style={typography.body}>
              {new Date(c.createdAtMs).toLocaleString()}
            </Text>
            <Text style={[typography.label, { color: colors.textDim }]}>
              {(c.video.durationMs / 1000).toFixed(1)}s
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      <ComparePane
        session={sessionA}
        pose={currentPoseA}
        positionMs={positionAMs}
        label="A"
        width={width}
        player={playerA}
      />
      <ComparePane
        session={sessionB}
        pose={currentPoseB}
        positionMs={positionBMs}
        label="B"
        width={width}
        player={playerB}
      />
      <View style={styles.scrubberSection}>
        <Text style={typography.label}>Shared progress: {Math.round(progress * 100)}%</Text>
        <View style={styles.scrubberTrack}>
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <Pressable
              key={p}
              style={[
                styles.scrubberTick,
                p <= progress && { backgroundColor: colors.accent },
              ]}
              onPress={() => scrubTo(p)}
            >
              <Text style={[typography.label, { color: colors.text }]}>
                {Math.round(p * 100)}%
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

interface ComparePaneProps {
  readonly session: Session;
  readonly pose: Pose2D | null;
  readonly positionMs: number;
  readonly label: string;
  readonly width: number;
  readonly player: ReturnType<typeof useVideoPlayer>;
}

function ComparePane({
  session,
  pose,
  positionMs,
  label,
  width,
  player,
}: ComparePaneProps): React.ReactElement {
  const videoAspect = session.video.heightPx
    ? session.video.widthPx / session.video.heightPx
    : 9 / 16;
  const poseSource = session.poseTrack?.source ?? 'mock';
  const isSyntheticOverReal = poseSource === 'mock' && session.note !== 'demo-seed';
  return (
    <View style={{ width, aspectRatio: videoAspect, backgroundColor: 'black' }}>
      {session.note === 'demo-seed' ? (
        <View style={[StyleSheet.absoluteFill, styles.demoFrame]}>
          <Text style={[typography.label, { color: colors.textDim }]}>
            Demo — {label}
          </Text>
        </View>
      ) : (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
        />
      )}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <PoseOverlay pose={isSyntheticOverReal ? null : pose} holds={[]} />
      </View>
      {!isSyntheticOverReal && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <ComPathOverlay analytics={session.analytics} currentMs={positionMs} />
        </View>
      )}
      <View style={styles.paneBadge} pointerEvents="none">
        <Text style={[typography.label, { color: colors.text }]}>Attempt {label}</Text>
      </View>
    </View>
  );
}

function nearestByTimestamp(
  arr: ReadonlyArray<Pose2D> | undefined,
  t: number,
): Pose2D | null {
  if (!arr || arr.length === 0) return null;
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].timestampMs < t) lo = mid + 1;
    else hi = mid;
  }
  return arr[lo];
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
  paneBadge: {
    position: 'absolute',
    left: spacing.s,
    top: spacing.s,
    paddingHorizontal: spacing.s,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.pill,
  },
  candidate: {
    padding: spacing.m,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    marginBottom: spacing.s,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scrubberSection: {
    padding: spacing.l,
    gap: spacing.s,
  },
  scrubberTrack: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  scrubberTick: {
    flex: 1,
    paddingVertical: spacing.s,
    alignItems: 'center',
    borderRadius: radius.m,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
});

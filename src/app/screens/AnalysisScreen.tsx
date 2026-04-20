import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppStore } from '../store/appStore';
import { colors, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/RootNavigator';

/**
 * Runs the analysis pipeline against the current draft and, when it
 * finishes, navigates to the SessionDetail screen for the new session.
 *
 * The draft has already been prepared by RecordScreen or UploadScreen
 * and passed through HoldTagScreen. This screen is pure progress UI.
 */
export function AnalysisScreen(): React.ReactElement {
  const draft = useAppStore((s) => s.draft);
  const analysisProgress = useAppStore((s) => s.analysisProgress);
  const analyzeDraft = useAppStore((s) => s.analyzeDraft);
  const lastError = useAppStore((s) => s.lastError);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [runToken, setRunToken] = useState(0);
  const [overrideWallGate, setOverrideWallGate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!draft) return;
    void (async () => {
      const session = await analyzeDraft({
        wallDetectionEnabled: !overrideWallGate,
      });
      if (cancelled) return;
      if (session) {
        nav.replace('SessionDetail', { sessionId: session.id });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft, analyzeDraft, nav, runToken, overrideWallGate]);

  const wallGateFailed = lastError?.startsWith('No climbing wall detected');
  const showSpinner = !lastError;

  return (
    <View style={styles.root}>
      {showSpinner && <ActivityIndicator color={colors.accent} size="large" />}
      {showSpinner && (
        <Text style={[typography.subtitle, { marginTop: spacing.l }]}>
          {stageLabel(analysisProgress?.stage ?? 'wall_check')}
        </Text>
      )}
      {showSpinner && analysisProgress?.framesTotal ? (
        <Text style={[typography.label, { marginTop: spacing.s }]}>
          Frame {analysisProgress.framesProcessed ?? 0} / {analysisProgress.framesTotal}
        </Text>
      ) : null}
      {lastError && (
        <Text style={[typography.body, { color: colors.bad, marginTop: spacing.m }]}>
          {lastError}
        </Text>
      )}
      {wallGateFailed && (
        <Pressable
          style={styles.overrideButton}
          onPress={() => {
            setOverrideWallGate(true);
            setRunToken((t) => t + 1);
          }}
        >
          <Text style={styles.overrideText}>Analyze anyway</Text>
        </Pressable>
      )}
    </View>
  );
}

function stageLabel(stage: string): string {
  switch (stage) {
    case 'wall_check':
      return 'Checking for climbing wall…';
    case 'pose':
      return 'Extracting 2D pose…';
    case 'lift':
      return 'Lifting to 3D…';
    case 'phases':
      return 'Segmenting movement phases…';
    case 'score':
      return 'Scoring technique…';
    case 'done':
      return 'Done.';
    default:
      return 'Analyzing…';
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  overrideButton: {
    marginTop: spacing.l,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  overrideText: {
    color: colors.bg,
    fontWeight: '600',
  },
});

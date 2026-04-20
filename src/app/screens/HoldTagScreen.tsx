import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import { classifyHoldByRadius } from '@analysis/holds';
import {
  makeId,
  type Hold,
  type HoldId,
  type HoldRole,
  type HoldType,
  type NormalizedPoint2D,
  type RouteSequenceStep,
} from '@domain/models';

import { useAppStore } from '../store/appStore';
import { colors, holdRoleColor, radius, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/RootNavigator';

const HOLD_TYPES: ReadonlyArray<HoldType> = [
  'jug',
  'crimp',
  'pinch',
  'sloper',
  'pocket',
  'foot_chip',
  'volume',
];

const HOLD_ROLES: ReadonlyArray<HoldRole> = [
  'start',
  'intermediate',
  'finish',
  'foot_only',
];

/**
 * Manual hold-tagging UI.
 *
 * - Tap a point on the reference frame → places a new hold.
 * - Tap an existing hold → opens the hold inspector and you can
 *   change its type / role / sequence order.
 * - Long-press a hold → removes it.
 *
 * Positions are stored in NORMALIZED coordinates so they're stable
 * across screen sizes and transferable to the analysis pipeline.
 *
 * For V1 the "reference frame" is the thumbnail of the draft video
 * (or a placeholder). Real frame-by-frame scrubbing to pick a hold
 * frame is scheduled for V1.1 — documented in ARCHITECTURE.md.
 */
export function HoldTagScreen(): React.ReactElement {
  const draft = useAppStore((s) => s.draft);
  const updateDraftRoute = useAppStore((s) => s.updateDraftRoute);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [layout, setLayout] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [selectedId, setSelectedId] = useState<HoldId | null>(null);
  const [positionMs, setPositionMs] = useState(0);

  const holds = draft?.route.holds ?? [];
  const sequence = draft?.route.sequence ?? [];
  const selected = useMemo(
    () => holds.find((h) => h.id === selectedId) ?? null,
    [holds, selectedId],
  );

  // Scrubbable video lets the user walk through the climb and tag each
  // hold on the frame where it's clearly visible. The camera panning
  // during the climb is no longer a blocker — every hold carries the
  // timestamp of the frame it was tagged on (`capturedAtMs`).
  const videoUri = draft?.video.uri ?? null;
  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.1;
    p.muted = true;
    p.pause();
  });

  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('timeUpdate', (e) => {
      setPositionMs(Math.round((e.currentTime ?? 0) * 1000));
    });
    return () => sub.remove();
  }, [player]);

  const onFrameLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setLayout({ w: width, h: height });
  };

  const addHold = useCallback(
    (p: NormalizedPoint2D) => {
      if (!draft) return;
      const id = makeId<'Hold'>(`hld_${Date.now().toString(36)}`);
      const radiusGuess = 0.04;
      const suggestion = classifyHoldByRadius(radiusGuess);
      const newHold: Hold = {
        id,
        routeId: draft.route.id,
        position: p,
        radius: radiusGuess,
        type: suggestion.type,
        suggestedType: suggestion.type,
        suggestedTypeConfidence: suggestion.confidence,
        capturedAtMs: positionMs,
        role: holds.length === 0 ? 'start' : 'intermediate',
      };
      const nextHolds = [...holds, newHold];
      const nextSeq: RouteSequenceStep[] = [
        ...sequence,
        {
          order: sequence.length + 1,
          holdId: id,
          limb: 'either',
        },
      ];
      updateDraftRoute({ ...draft.route, holds: nextHolds, sequence: nextSeq });
      setSelectedId(id);
    },
    [draft, holds, sequence, updateDraftRoute, positionMs],
  );

  const removeHold = useCallback(
    (id: HoldId) => {
      if (!draft) return;
      updateDraftRoute({
        ...draft.route,
        holds: holds.filter((h) => h.id !== id),
        sequence: sequence.filter((s) => s.holdId !== id).map((s, i) => ({ ...s, order: i + 1 })),
      });
      setSelectedId(null);
    },
    [draft, holds, sequence, updateDraftRoute],
  );

  const updateHold = useCallback(
    (id: HoldId, patch: Partial<Hold>) => {
      if (!draft) return;
      updateDraftRoute({
        ...draft.route,
        holds: holds.map((h) => {
          if (h.id !== id) return h;
          const merged: Hold = { ...h, ...patch };
          // If the user resized the hold, re-run the size-based guess
          // but DO NOT overwrite an explicitly-set type. We only touch
          // `suggestedType`, and `type` updates only when the user has
          // not deviated from the previous suggestion yet.
          if (patch.radius !== undefined && patch.radius !== h.radius) {
            const g = classifyHoldByRadius(patch.radius);
            const userUntouched = h.type === h.suggestedType;
            return {
              ...merged,
              suggestedType: g.type,
              suggestedTypeConfidence: g.confidence,
              type: userUntouched ? g.type : merged.type,
            };
          }
          return merged;
        }),
      });
    },
    [draft, holds, updateDraftRoute],
  );

  if (!draft) {
    return (
      <View style={styles.center}>
        <Text style={typography.body}>No video selected. Record or upload first.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <View
        style={styles.frame}
        onLayout={onFrameLayout}
        onStartShouldSetResponder={() => true}
      >
        {videoUri ? (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            nativeControls
          />
        ) : draft.video.thumbnailUri ? (
          <Image source={{ uri: draft.video.thumbnailUri }} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgElevated }]} />
        )}
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          onPress={(e) => {
            const { locationX, locationY } = e.nativeEvent as unknown as {
              locationX: number;
              locationY: number;
            };
            const nx = locationX / Math.max(1, layout.w);
            const ny = locationY / Math.max(1, layout.h);
            if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
            addHold({ x: nx, y: ny });
          }}
        >
          <G>
            {holds.map((h, i) => {
              // Fade holds that were captured at a different video time,
              // so camera panning doesn't pile every hold onto whatever
              // frame the user is currently viewing.
              const dt =
                h.capturedAtMs === undefined
                  ? 0
                  : Math.abs(h.capturedAtMs - positionMs);
              const opacity = dt <= 1500 ? 0.9 : dt <= 4000 ? 0.35 : 0.12;
              return (
                <G key={h.id} opacity={opacity}>
                  <Circle
                    cx={h.position.x * 100}
                    cy={h.position.y * 100}
                    r={h.radius * 100}
                    fill={selectedId === h.id ? colors.accent : 'transparent'}
                    stroke={holdRoleColor(h.role)}
                    strokeWidth={selectedId === h.id ? 1.6 : 1}
                    onPress={() => {
                      setSelectedId(h.id);
                      if (player && h.capturedAtMs !== undefined) {
                        player.currentTime = h.capturedAtMs / 1000;
                      }
                    }}
                  />
                  <SvgText
                    x={h.position.x * 100}
                    y={h.position.y * 100 + 1.8}
                    fill={colors.text}
                    fontSize={3.5}
                    textAnchor="middle"
                  >
                    {i + 1}
                  </SvgText>
                </G>
              );
            })}
            {sequence.length > 1 &&
              sequence.slice(1).map((step, i) => {
                const prev = holds.find((h) => h.id === sequence[i].holdId);
                const curr = holds.find((h) => h.id === step.holdId);
                if (!prev || !curr) return null;
                return (
                  <Line
                    key={step.holdId}
                    x1={prev.position.x * 100}
                    y1={prev.position.y * 100}
                    x2={curr.position.x * 100}
                    y2={curr.position.y * 100}
                    stroke={colors.accentMuted}
                    strokeWidth={0.8}
                    strokeDasharray="2,1"
                  />
                );
              })}
          </G>
        </Svg>
      </View>

      <Text style={[typography.label, { padding: spacing.m }]}>
        Scrub to the frame where a hold is visible, then tap it.
        Each hold remembers its frame, so panning the camera is fine.
      </Text>

      {selected && (
        <HoldInspector
          hold={selected}
          onChange={(p) => updateHold(selected.id, p)}
          onDelete={() => removeHold(selected.id)}
        />
      )}

      <View style={{ padding: spacing.l, gap: spacing.m }}>
        <Text style={typography.subtitle}>Sequence</Text>
        {sequence.length === 0 ? (
          <Text style={[typography.body, { color: colors.textDim }]}>
            Add holds to build the sequence.
          </Text>
        ) : (
          sequence.map((step, i) => {
            const hold = holds.find((h) => h.id === step.holdId);
            return (
              <View key={step.holdId} style={styles.seqRow}>
                <Text style={[typography.subtitle, { color: colors.accent }]}>{i + 1}</Text>
                <Text style={[typography.body, { flex: 1 }]}>
                  {hold?.label ?? hold?.type ?? 'hold'} ({hold?.role})
                </Text>
                <Text style={[typography.label, { color: colors.textDim }]}>{step.limb}</Text>
              </View>
            );
          })
        )}
      </View>

      <Pressable
        style={[
          styles.primaryBtn,
          holds.length < 2 && { backgroundColor: colors.accentMuted },
        ]}
        disabled={holds.length < 2}
        onPress={() => nav.navigate('Analysis')}
      >
        <Text style={styles.primaryBtnLabel}>
          {holds.length < 2 ? 'Add at least 2 holds' : 'Run analysis'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function HoldInspector({
  hold,
  onChange,
  onDelete,
}: {
  hold: Hold;
  onChange: (p: Partial<Hold>) => void;
  onDelete: () => void;
}): React.ReactElement {
  const autoBadge =
    hold.suggestedType && hold.type === hold.suggestedType
      ? `Auto-detected: ${hold.suggestedType}${
          hold.suggestedTypeConfidence
            ? ` (${Math.round(hold.suggestedTypeConfidence * 100)}%)`
            : ''
        } — tap to change`
      : hold.suggestedType
      ? `Auto-detected: ${hold.suggestedType} — you set: ${hold.type}`
      : null;

  const bumpRadius = (delta: number) => {
    const next = Math.max(0.012, Math.min(0.15, +(hold.radius + delta).toFixed(3)));
    onChange({ radius: next });
  };

  return (
    <View style={styles.inspector}>
      <Text style={typography.subtitle}>Hold #{hold.id.slice(-4)}</Text>
      {autoBadge && (
        <Text style={[typography.label, { color: colors.textDim }]}>{autoBadge}</Text>
      )}
      <View style={styles.row}>
        <Text style={[typography.label, { alignSelf: 'center' }]}>Size</Text>
        <Pressable style={styles.chip} onPress={() => bumpRadius(-0.01)}>
          <Text style={{ color: colors.text }}>−</Text>
        </Pressable>
        <View style={[styles.chip, { backgroundColor: colors.bgElevated }]}>
          <Text style={{ color: colors.text }}>{hold.radius.toFixed(3)}</Text>
        </View>
        <Pressable style={styles.chip} onPress={() => bumpRadius(+0.01)}>
          <Text style={{ color: colors.text }}>+</Text>
        </Pressable>
      </View>
      <Text style={typography.label}>Type</Text>
      <View style={styles.row}>
        {HOLD_TYPES.map((t) => (
          <Pressable
            key={t}
            style={[styles.chip, hold.type === t && styles.chipActive]}
            onPress={() => onChange({ type: t })}
          >
            <Text style={{ color: hold.type === t ? colors.bg : colors.text }}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={typography.label}>Role</Text>
      <View style={styles.row}>
        {HOLD_ROLES.map((r) => (
          <Pressable
            key={r}
            style={[styles.chip, hold.role === r && styles.chipActive]}
            onPress={() => onChange({ role: r })}
          >
            <Text style={{ color: hold.role === r ? colors.bg : colors.text }}>{r}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={[styles.chip, { backgroundColor: colors.bad, alignSelf: 'flex-start' }]} onPress={onDelete}>
        <Text style={{ color: colors.bg, fontWeight: '700' }}>Remove hold</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.bg, paddingBottom: spacing.xl },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    aspectRatio: 9 / 16,
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inspector: {
    backgroundColor: colors.bgCard,
    marginHorizontal: spacing.l,
    padding: spacing.m,
    borderRadius: radius.l,
    gap: spacing.s,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  seqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingVertical: spacing.xs,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    marginHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  primaryBtnLabel: { color: colors.bg, fontWeight: '700', fontSize: 16 },
});

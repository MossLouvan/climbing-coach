import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import {
  makeId,
  type Hold,
  type HoldId,
  type HoldRole,
  type HoldType,
  type NormalizedPoint2D,
  type Route,
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

  const holds = draft?.route.holds ?? [];
  const sequence = draft?.route.sequence ?? [];
  const selected = useMemo(
    () => holds.find((h) => h.id === selectedId) ?? null,
    [holds, selectedId],
  );

  const onFrameLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setLayout({ w: width, h: height });
  };

  const addHold = useCallback(
    (p: NormalizedPoint2D) => {
      if (!draft) return;
      const id = makeId<'Hold'>(`hld_${Date.now().toString(36)}`);
      const newHold: Hold = {
        id,
        routeId: draft.route.id,
        position: p,
        radius: 0.04,
        type: 'jug',
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
    [draft, holds, sequence, updateDraftRoute],
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
        holds: holds.map((h) => (h.id === id ? { ...h, ...patch } : h)),
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
        {draft.video.thumbnailUri ? (
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
            {holds.map((h, i) => (
              <G key={h.id}>
                <Circle
                  cx={h.position.x * 100}
                  cy={h.position.y * 100}
                  r={h.radius * 100}
                  fill={selectedId === h.id ? colors.accent : 'transparent'}
                  stroke={holdRoleColor(h.role)}
                  strokeWidth={selectedId === h.id ? 1.6 : 1}
                  opacity={0.9}
                  onPress={() => setSelectedId(h.id)}
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
            ))}
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
        Tap the frame to add a hold. Tap an existing hold to edit it.
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
  return (
    <View style={styles.inspector}>
      <Text style={typography.subtitle}>Hold #{hold.id.slice(-4)}</Text>
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

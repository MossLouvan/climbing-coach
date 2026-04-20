import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { TechniqueEvent } from '@domain/models';

import { TECHNIQUE_EVENT_COLORS, isEventActive } from './helpers';

/**
 * Horizontal row of colored "event" pills — one per detected technique
 * event. The pill pulses (opacity + border) while `currentMs` falls
 * within the event's window. Tap a pill to jump to its start.
 */
export interface TechniqueEventPillsProps {
  readonly events: ReadonlyArray<TechniqueEvent>;
  readonly currentMs: number;
  readonly onSelect?: (event: TechniqueEvent) => void;
}

export function TechniqueEventPills({
  events,
  currentMs,
  onSelect,
}: TechniqueEventPillsProps): React.ReactElement | null {
  if (!events || events.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {events.map((ev, i) => {
        const active = isEventActive(ev, currentMs);
        const bg = TECHNIQUE_EVENT_COLORS[ev.kind] ?? '#4DA3FF';
        return (
          <View
            key={`${ev.kind}-${ev.startMs}-${i}`}
            onTouchEnd={onSelect ? () => onSelect(ev) : undefined}
            style={[
              styles.pill,
              {
                backgroundColor: active ? bg : withAlpha(bg, 0.35),
                borderColor: bg,
                opacity: active ? 1 : 0.85,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: active ? '#0B1020' : '#F2F4FA' },
              ]}
            >
              {prettyKind(ev.kind)}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function prettyKind(kind: string): string {
  return kind.replace(/_/g, ' ');
}

function withAlpha(hex: string, alpha: number): string {
  // Convert "#RRGGBB" -> "rgba(r,g,b,a)"; fallback to hex as-is.
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});

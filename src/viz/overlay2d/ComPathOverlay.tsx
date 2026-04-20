import React from 'react';
import Svg, { G, Line } from 'react-native-svg';

import type { AnalyticsTrack } from '@domain/models';

import { computeFadingSegments, extractCom2D } from './helpers';

/**
 * Renders a fading center-of-mass trail over a ±`windowMs` window around
 * the current playback time. Newest segment (closest to `currentMs`) is
 * drawn most opaque; older / future segments fade toward the edges.
 */
export interface ComPathOverlayProps {
  readonly analytics: AnalyticsTrack | null | undefined;
  readonly currentMs: number;
  /** Half-width of the trail window, in ms. Default 3000 (±3 s). */
  readonly windowMs?: number;
  readonly stroke?: string;
  readonly strokeWidth?: number;
}

export function ComPathOverlay({
  analytics,
  currentMs,
  windowMs = 3000,
  stroke = '#FDE68A',
  strokeWidth = 1.2,
}: ComPathOverlayProps): React.ReactElement | null {
  if (!analytics || analytics.perFrame.length < 2) return null;
  const segments = computeFadingSegments(
    analytics.perFrame,
    currentMs,
    windowMs,
    extractCom2D,
  );
  if (segments.length === 0) return null;
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <G>
        {segments.map((s, i) => (
          <Line
            key={i}
            x1={s.x1 * 100}
            y1={s.y1 * 100}
            x2={s.x2 * 100}
            y2={s.y2 * 100}
            stroke={stroke}
            strokeOpacity={s.opacity}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        ))}
      </G>
    </Svg>
  );
}

import React from 'react';
import Svg, { G, Line } from 'react-native-svg';

import type { AnalyticsTrack } from '@domain/models';

import { computeFadingSegments, extractHip2D } from './helpers';

/**
 * Fading polyline over the hip midpoint trajectory. Same shape as
 * ComPathOverlay but a different color / extractor so both can be
 * rendered simultaneously without visually fusing.
 */
export interface HipTrajectoryOverlayProps {
  readonly analytics: AnalyticsTrack | null | undefined;
  readonly currentMs: number;
  readonly windowMs?: number;
  readonly stroke?: string;
  readonly strokeWidth?: number;
}

export function HipTrajectoryOverlay({
  analytics,
  currentMs,
  windowMs = 3000,
  stroke = '#F472B6',
  strokeWidth = 1.1,
}: HipTrajectoryOverlayProps): React.ReactElement | null {
  if (!analytics || analytics.perFrame.length < 2) return null;
  const segments = computeFadingSegments(
    analytics.perFrame,
    currentMs,
    windowMs,
    extractHip2D,
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
            strokeDasharray="1.5,1"
            strokeLinecap="round"
          />
        ))}
      </G>
    </Svg>
  );
}

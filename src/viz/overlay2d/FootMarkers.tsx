import React from 'react';
import Svg, { Circle, G } from 'react-native-svg';

import { detectContacts } from '@analysis/holds/contact';
import { type Hold, type Pose2D } from '@domain/models';

/**
 * Small circular markers at each foot-contact point for the current
 * frame. Green = left foot, blue = right foot. Uses `detectContacts` so
 * the criterion matches the rest of the analysis pipeline.
 */
export interface FootMarkersProps {
  readonly pose: Pose2D | null | undefined;
  readonly holds: ReadonlyArray<Hold>;
  readonly minPoseScore?: number;
}

const LEFT_FOOT_COLOR = '#4ADE80';
const RIGHT_FOOT_COLOR = '#60A5FA';

export function FootMarkers({
  pose,
  holds,
  minPoseScore = 0.3,
}: FootMarkersProps): React.ReactElement | null {
  if (!pose || pose.score < minPoseScore || holds.length === 0) return null;
  const contacts = detectContacts(pose, holds);
  const footContacts = contacts.filter(
    (c) => c.limb === 'left_foot' || c.limb === 'right_foot',
  );
  if (footContacts.length === 0) return null;

  const holdById = new Map<string, Hold>();
  for (const h of holds) holdById.set(h.id, h);

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <G>
        {footContacts.map((c, i) => {
          const h = holdById.get(c.holdId);
          if (!h) return null;
          const color = c.limb === 'left_foot' ? LEFT_FOOT_COLOR : RIGHT_FOOT_COLOR;
          return (
            <G key={i}>
              <Circle
                cx={h.position.x * 100}
                cy={h.position.y * 100}
                r={Math.max(1.4, h.radius * 100 * 0.6)}
                fill={color}
                fillOpacity={0.35}
                stroke={color}
                strokeWidth={0.8}
              />
            </G>
          );
        })}
      </G>
    </Svg>
  );
}

import React from 'react';
import Svg, { Circle, G, Line } from 'react-native-svg';

import {
  JOINT_INDEX,
  SKELETON_BONES,
  type Hold,
  type Pose2D,
} from '@domain/models';

import { colors, holdRoleColor } from '../../app/theme/tokens';

/**
 * Stateless 2D pose + hold overlay. Renders into a 100x100 viewBox so
 * callers can size it to any video frame via `preserveAspectRatio`.
 */
export interface PoseOverlayProps {
  readonly pose: Pose2D | null;
  readonly holds: ReadonlyArray<Hold>;
  readonly minConfidence?: number;
  readonly showBones?: boolean;
  readonly showHolds?: boolean;
}

export function PoseOverlay({
  pose,
  holds,
  minConfidence = 0.3,
  showBones = true,
  showHolds = true,
}: PoseOverlayProps): React.ReactElement {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      {showHolds && (
        <G opacity={0.9}>
          {holds.map((h) => (
            <Circle
              key={h.id}
              cx={h.position.x * 100}
              cy={h.position.y * 100}
              r={h.radius * 100}
              fill="transparent"
              stroke={holdRoleColor(h.role)}
              strokeWidth={1}
            />
          ))}
        </G>
      )}
      {pose && (
        <>
          {showBones && (
            <G>
              {SKELETON_BONES.map(([a, b], i) => {
                const ka = pose.keypoints[JOINT_INDEX[a]];
                const kb = pose.keypoints[JOINT_INDEX[b]];
                if (!ka || !kb) return null;
                if (ka.confidence < minConfidence || kb.confidence < minConfidence) return null;
                const isLeft = a.startsWith('left') || b.startsWith('left');
                const stroke = a === 'left_shoulder' && b === 'right_shoulder'
                  ? colors.boneSpine
                  : isLeft
                    ? colors.boneLeft
                    : colors.boneRight;
                return (
                  <Line
                    key={i}
                    x1={ka.x * 100}
                    y1={ka.y * 100}
                    x2={kb.x * 100}
                    y2={kb.y * 100}
                    stroke={stroke}
                    strokeWidth={1.2}
                    strokeLinecap="round"
                  />
                );
              })}
            </G>
          )}
          <G>
            {pose.keypoints.map((kp, i) => {
              if (kp.confidence < minConfidence) return null;
              return (
                <Circle
                  key={i}
                  cx={kp.x * 100}
                  cy={kp.y * 100}
                  r={0.8}
                  fill={colors.accent}
                />
              );
            })}
          </G>
        </>
      )}
    </Svg>
  );
}

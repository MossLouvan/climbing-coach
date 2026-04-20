import React from 'react';
import Svg, { G, Text as SvgText } from 'react-native-svg';

import { JOINT_INDEX, type Pose2D } from '@domain/models';

import { computeLimbAngles } from './helpers';

/**
 * Renders numeric joint-angle readouts (degrees) next to the left &
 * right elbows and knees of the current pose. Only shown when the
 * overall pose score is above `minPoseScore` — the text gets noisy on
 * low-confidence frames.
 */
export interface JointAngleLabelsProps {
  readonly pose: Pose2D | null | undefined;
  readonly minPoseScore?: number;
  readonly minJointConfidence?: number;
  readonly color?: string;
  readonly fontSize?: number;
}

export function JointAngleLabels({
  pose,
  minPoseScore = 0.6,
  minJointConfidence = 0.3,
  color = '#F2F4FA',
  fontSize = 3,
}: JointAngleLabelsProps): React.ReactElement | null {
  if (!pose || pose.score < minPoseScore) return null;
  const angles = computeLimbAngles(pose, minJointConfidence);
  const k = pose.keypoints;
  const labels: Array<{ x: number; y: number; text: string }> = [];
  const push = (jointIdx: number, value: number | null, dx: number): void => {
    if (value === null) return;
    const kp = k[jointIdx];
    if (!kp || kp.confidence < minJointConfidence) return;
    labels.push({
      x: kp.x * 100 + dx,
      y: kp.y * 100 - 1,
      text: `${Math.round(value)}°`,
    });
  };
  push(JOINT_INDEX.left_elbow, angles.leftElbow, -2.5);
  push(JOINT_INDEX.right_elbow, angles.rightElbow, 1.5);
  push(JOINT_INDEX.left_knee, angles.leftKnee, -2.5);
  push(JOINT_INDEX.right_knee, angles.rightKnee, 1.5);
  if (labels.length === 0) return null;

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <G>
        {labels.map((l, i) => (
          <SvgText
            key={i}
            x={l.x}
            y={l.y}
            fill={color}
            fontSize={fontSize}
            fontWeight="600"
            textAnchor="middle"
            stroke="#0B1020"
            strokeWidth={0.25}
          >
            {l.text}
          </SvgText>
        ))}
      </G>
    </Svg>
  );
}

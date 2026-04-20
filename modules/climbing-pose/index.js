// Plain JS so Metro can load this module without running the
// TypeScript transformer on a path inside node_modules. The types
// live in `index.d.ts` next to this file.

const { requireNativeModule, requireOptionalNativeModule } = require('expo-modules-core');

let cached = null;

function loadNative() {
  if (cached) return cached;
  // Prefer optional require so missing-module cases don't throw from
  // deep inside expo-modules-core's error formatter.
  const optional =
    typeof requireOptionalNativeModule === 'function'
      ? requireOptionalNativeModule('ClimbingPose')
      : null;
  if (optional) {
    cached = optional;
    return cached;
  }
  cached = requireNativeModule('ClimbingPose');
  return cached;
}

function isClimbingPoseAvailable() {
  try {
    const m = loadNative();
    return m != null && typeof m.detectPosesInVideo === 'function';
  } catch (e) {
    return false;
  }
}

function detectPosesInVideo(videoUri, targetFps, maxFrames) {
  const m = loadNative();
  return m.detectPosesInVideo(videoUri, targetFps, maxFrames == null ? null : maxFrames);
}

module.exports = {
  isClimbingPoseAvailable,
  detectPosesInVideo,
};

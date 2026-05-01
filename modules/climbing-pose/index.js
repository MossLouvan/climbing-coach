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

// --- Apple Vision path (legacy, iOS only) ---------------------------

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

// --- Ultralytics YOLO-Pose path -------------------------------------
//
// Entry points return `false` / reject when either:
//   (a) the native binary does not include the YOLO bridge, or
//   (b) no weights file is bundled under the platform's weights dir.
// The JS caller (YoloPoseProvider) treats this as a "not bundled"
// signal and falls back via `resolvePoseProvider`.

function isYoloPoseAvailable() {
  try {
    const m = loadNative();
    if (m == null || typeof m.isYoloPoseAvailable !== 'function') return false;
    return m.isYoloPoseAvailable() === true;
  } catch (e) {
    return false;
  }
}

function detectPosesInVideoWithYolo(videoUri, targetFps, maxFrames) {
  const m = loadNative();
  if (m == null || typeof m.detectPosesInVideoWithYolo !== 'function') {
    return Promise.reject(
      new Error(
        'climbing-pose: YOLO-Pose bridge not present in this native build. ' +
          'Rebuild against the module version that includes the YOLO entry points.',
      ),
    );
  }
  return m.detectPosesInVideoWithYolo(
    videoUri,
    targetFps,
    maxFrames == null ? null : maxFrames,
  );
}

module.exports = {
  isClimbingPoseAvailable,
  detectPosesInVideo,
  isYoloPoseAvailable,
  detectPosesInVideoWithYolo,
};

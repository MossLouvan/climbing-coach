import AVFoundation
import CoreGraphics
import ExpoModulesCore
import Foundation
import UIKit
import Vision

/// Expo module that runs Apple's `VNDetectHumanBodyPoseRequest` over
/// sampled frames of a local video and returns a COCO-17 keypoint track.
///
/// Why this module exists:
///   - The app's JS pose provider (MockPoseProvider) produces a fake
///     trace that doesn't follow the real climber. This module gives
///     us real on-device pose inference with zero cloud dependency,
///     zero model download, and no extra native libraries — Apple
///     ships the pose model inside `Vision.framework`.
///   - Works offline, respects the app's local-first posture.
///
/// Output convention (must match `src/domain/models/pose.ts`):
///   - 17 keypoints per frame in COCO order:
///       [nose, left_eye, right_eye, left_ear, right_ear,
///        left_shoulder, right_shoulder, left_elbow, right_elbow,
///        left_wrist, right_wrist, left_hip, right_hip,
///        left_knee, right_knee, left_ankle, right_ankle]
///   - `x`, `y` normalized to [0, 1] with ORIGIN TOP-LEFT
///     (Vision gives bottom-left, so we flip `y`).
///   - `confidence` in [0, 1].
public class ClimbingPoseModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ClimbingPose")

    AsyncFunction("detectPosesInVideo") {
      (videoUri: String, targetFps: Double, maxFrames: Int?, promise: Promise) in
      guard let url = Self.resolveUrl(videoUri) else {
        promise.reject("ERR_URI", "Invalid video URI: \(videoUri)")
        return
      }
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let result = try Self.extractPoses(
            url: url,
            targetFps: max(1.0, min(30.0, targetFps)),
            maxFrames: maxFrames
          )
          promise.resolve(result)
        } catch {
          promise.reject("ERR_POSE", error.localizedDescription)
        }
      }
    }
  }

  // MARK: - Helpers

  private static func resolveUrl(_ raw: String) -> URL? {
    if raw.hasPrefix("file://") || raw.hasPrefix("http") {
      return URL(string: raw)
    }
    return URL(fileURLWithPath: raw)
  }

  private static func extractPoses(
    url: URL,
    targetFps: Double,
    maxFrames: Int?
  ) throws -> [String: Any] {
    let asset = AVURLAsset(url: url)
    let durationSec = CMTimeGetSeconds(asset.duration)
    guard durationSec.isFinite, durationSec > 0 else {
      throw NSError(
        domain: "ClimbingPose", code: 10,
        userInfo: [NSLocalizedDescriptionKey: "Empty or unreadable video"]
      )
    }

    // Natural size + preferred transform yields the oriented frame size.
    var naturalSize = CGSize(width: 1080, height: 1920)
    var transform = CGAffineTransform.identity
    if let track = asset.tracks(withMediaType: .video).first {
      naturalSize = track.naturalSize
      transform = track.preferredTransform
    }
    let displaySize = naturalSize.applying(transform)
    let width = abs(displaySize.width)
    let height = abs(displaySize.height)

    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = CMTime(value: 1, timescale: 30)
    generator.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 30)
    // Scale frames down so Vision is fast — Apple's pose detector is
    // plenty accurate on ~720px-wide inputs. 1920x1080 full-res doesn't
    // move the needle for skeleton placement.
    let maxDim: CGFloat = 720
    let scale = min(1.0, maxDim / max(width, height))
    generator.maximumSize = CGSize(width: width * scale, height: height * scale)

    let step = 1.0 / targetFps
    var sampleTimes: [CMTime] = []
    var t = 0.0
    while t < durationSec {
      sampleTimes.append(CMTime(seconds: t, preferredTimescale: 600))
      t += step
      if let cap = maxFrames, sampleTimes.count >= cap { break }
    }

    var poses: [[String: Any]] = []
    poses.reserveCapacity(sampleTimes.count)

    for (idx, time) in sampleTimes.enumerated() {
      var actual = CMTime.zero
      guard let cgImage = try? generator.copyCGImage(at: time, actualTime: &actual) else {
        continue
      }
      let request = VNDetectHumanBodyPoseRequest()
      // Vision expects an orientation hint. `appliesPreferredTrackTransform`
      // already rotates the pixel buffer, so we use `.up` here.
      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
      do {
        try handler.perform([request])
      } catch {
        continue
      }
      guard let obs = request.results?.first as? VNHumanBodyPoseObservation else {
        continue
      }
      let keypoints = Self.toCoco17(observation: obs)
      let meanConf = keypoints.reduce(0.0) { $0 + ($1["confidence"] as? Double ?? 0) }
        / Double(keypoints.count)
      poses.append([
        "frame": idx,
        "timestampMs": Int(CMTimeGetSeconds(actual) * 1000),
        "keypoints": keypoints,
        "score": meanConf
      ])
    }

    return [
      "fps": targetFps,
      "widthPx": Int(width),
      "heightPx": Int(height),
      "poses2D": poses
    ]
  }

  /// Map Apple Vision's 19-point skeleton to the app's COCO-17 ordering.
  /// Missing points (e.g. eyes/ears — Vision lumps them as head joints)
  /// get best-effort fallbacks so downstream analysis never sees `nil`.
  private static func toCoco17(
    observation: VNHumanBodyPoseObservation
  ) -> [[String: Any]] {
    // COCO order (17):
    let coco: [VNHumanBodyPoseObservation.JointName] = [
      .nose,          // 0
      .leftEye,       // 1
      .rightEye,      // 2
      .leftEar,       // 3
      .rightEar,      // 4
      .leftShoulder,  // 5
      .rightShoulder, // 6
      .leftElbow,     // 7
      .rightElbow,    // 8
      .leftWrist,     // 9
      .rightWrist,    // 10
      .leftHip,       // 11
      .rightHip,      // 12
      .leftKnee,      // 13
      .rightKnee,     // 14
      .leftAnkle,     // 15
      .rightAnkle     // 16
    ]
    var out: [[String: Any]] = []
    out.reserveCapacity(coco.count)
    for joint in coco {
      if let point = try? observation.recognizedPoint(joint), point.confidence > 0 {
        out.append([
          // Flip Y: Vision uses bottom-left origin; we use top-left.
          "x": Double(point.location.x),
          "y": 1.0 - Double(point.location.y),
          "confidence": Double(point.confidence)
        ])
      } else {
        out.append(["x": 0.0, "y": 0.0, "confidence": 0.0])
      }
    }
    return out
  }
}

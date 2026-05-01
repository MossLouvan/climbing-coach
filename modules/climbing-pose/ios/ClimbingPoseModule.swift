import AVFoundation
import CoreGraphics
import CoreML
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

    // YOLO-Pose path. Honest contract: returns false when the bundled
    // weights are missing, which lets the JS resolver fall back to
    // Vision/Mock without surfacing an error to the user.
    Function("isYoloPoseAvailable") { () -> Bool in
      Self.yoloModelURL() != nil
    }

    AsyncFunction("detectPosesInVideoWithYolo") {
      (videoUri: String, targetFps: Double, maxFrames: Int?, promise: Promise) in
      guard let url = Self.resolveUrl(videoUri) else {
        promise.reject("ERR_URI", "Invalid video URI: \(videoUri)")
        return
      }
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let result = try Self.extractPosesYolo(
            url: url,
            targetFps: max(1.0, min(30.0, targetFps)),
            maxFrames: maxFrames
          )
          promise.resolve(result)
        } catch {
          promise.reject("ERR_POSE_YOLO", error.localizedDescription)
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

  // MARK: - YOLO-Pose path

  /// Tag bound to the bundled CoreML weights file. The JS side uses this
  /// to label `PoseTrack.providerName`; bump it whenever the weights
  /// file changes so old sessions remain attributable to the right run.
  private static let yoloModelTag = "yolo26n-pose"

  /// Score threshold below which a detection is treated as "no climber
  /// in frame". Matches Ultralytics' default for pose tasks. Frames
  /// below threshold yield zero-confidence keypoints so the downstream
  /// `liftConfidence` / phase-segmentation logic can drop them rather
  /// than imagining a climber where there is none.
  private static let yoloScoreThreshold: Double = 0.25

  /// Locate the compiled `.mlmodelc` (preferred) or the source
  /// `.mlpackage` for the YOLO weights bundled by the Expo module.
  /// Returns nil when the build did not include the weights, which is
  /// the contract `isYoloPoseAvailable()` reports back to JS.
  private static func yoloModelURL() -> URL? {
    let bundle = Bundle(for: ClimbingPoseModule.self)
    if let compiled = bundle.url(forResource: yoloModelTag, withExtension: "mlmodelc") {
      return compiled
    }
    if let package = bundle.url(forResource: yoloModelTag, withExtension: "mlpackage") {
      return package
    }
    return nil
  }

  /// Cached compiled CoreML model. Loading + compilation is amortized
  /// across frames in a single video; the second call is effectively
  /// free.
  private static var yoloModelCache: MLModel?
  private static let yoloModelCacheLock = NSLock()

  private static func loadYoloModel() throws -> MLModel {
    yoloModelCacheLock.lock()
    defer { yoloModelCacheLock.unlock() }
    if let cached = yoloModelCache {
      return cached
    }
    guard let modelURL = yoloModelURL() else {
      throw NSError(
        domain: "ClimbingPose",
        code: 20,
        userInfo: [
          NSLocalizedDescriptionKey:
            "YOLO-Pose weights not bundled. Run scripts/export/export_coreml.py and rebuild."
        ]
      )
    }
    let compiledURL: URL = try {
      if modelURL.pathExtension == "mlmodelc" {
        return modelURL
      }
      // Compile .mlpackage at runtime; CoreML caches its own derived
      // artifacts so this is fast on subsequent launches.
      return try MLModel.compileModel(at: modelURL)
    }()
    let config = MLModelConfiguration()
    config.computeUnits = .all // ANE + GPU + CPU; CoreML picks the best
    let model = try MLModel(contentsOf: compiledURL, configuration: config)
    yoloModelCache = model
    return model
  }

  /// Pull keypoints out of a video using the bundled YOLO-Pose
  /// CoreML model. Output schema is identical to `extractPoses`, plus
  /// a `modelTag` field so the JS side can attribute the session.
  private static func extractPosesYolo(
    url: URL,
    targetFps: Double,
    maxFrames: Int?
  ) throws -> [String: Any] {
    let model = try loadYoloModel()

    let asset = AVURLAsset(url: url)
    let durationSec = CMTimeGetSeconds(asset.duration)
    guard durationSec.isFinite, durationSec > 0 else {
      throw NSError(
        domain: "ClimbingPose", code: 10,
        userInfo: [NSLocalizedDescriptionKey: "Empty or unreadable video"]
      )
    }

    var naturalSize = CGSize(width: 1080, height: 1920)
    var transform = CGAffineTransform.identity
    if let track = asset.tracks(withMediaType: .video).first {
      naturalSize = track.naturalSize
      transform = track.preferredTransform
    }
    let displaySize = naturalSize.applying(transform)
    let origW = abs(displaySize.width)
    let origH = abs(displaySize.height)

    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = CMTime(value: 1, timescale: 30)
    generator.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 30)
    // YOLO needs a square 640 input; oversampling is wasted work.
    generator.maximumSize = CGSize(width: 640, height: 640)

    let step = 1.0 / targetFps
    var sampleTimes: [CMTime] = []
    var t = 0.0
    while t < durationSec {
      sampleTimes.append(CMTime(seconds: t, preferredTimescale: 600))
      t += step
      if let cap = maxFrames, sampleTimes.count >= cap { break }
    }

    let imageConstraint = model.modelDescription.inputDescriptionsByName["image"]?
      .imageConstraint
    guard let imgConstraint = imageConstraint else {
      throw NSError(
        domain: "ClimbingPose", code: 21,
        userInfo: [NSLocalizedDescriptionKey: "YOLO model has no `image` input"]
      )
    }
    // scaleFit preserves aspect ratio with letterbox padding — the
    // inverse transform below assumes this exact mode.
    let imageOptions: [MLFeatureValue.ImageOption: Any] = [
      .cropAndScale: VNImageCropAndScaleOption.scaleFit.rawValue
    ]

    var poses: [[String: Any]] = []
    poses.reserveCapacity(sampleTimes.count)

    let inputW = Double(imgConstraint.pixelsWide) // 640
    let inputH = Double(imgConstraint.pixelsHigh) // 640

    // Letterbox geometry — same for every frame, computed once.
    let aspect = origW / origH
    let scale: Double
    let padX: Double
    let padY: Double
    if aspect >= 1.0 {
      scale = inputW / Double(origW)
      padX = 0
      padY = (inputH - Double(origH) * scale) / 2.0
    } else {
      scale = inputH / Double(origH)
      padX = (inputW - Double(origW) * scale) / 2.0
      padY = 0
    }
    let scaledW = Double(origW) * scale
    let scaledH = Double(origH) * scale

    for (idx, time) in sampleTimes.enumerated() {
      var actual = CMTime.zero
      guard let cgImage = try? generator.copyCGImage(at: time, actualTime: &actual) else {
        continue
      }
      let imageFeature: MLFeatureValue
      do {
        imageFeature = try MLFeatureValue(
          cgImage: cgImage,
          constraint: imgConstraint,
          options: imageOptions
        )
      } catch {
        continue
      }
      let inputProvider: MLFeatureProvider
      do {
        inputProvider = try MLDictionaryFeatureProvider(dictionary: ["image": imageFeature])
      } catch {
        continue
      }
      let output: MLFeatureProvider
      do {
        output = try model.prediction(from: inputProvider)
      } catch {
        continue
      }
      // Output is named "var_1566" per the export; resolve dynamically
      // so a re-export with a different output name still works as long
      // as there is exactly one multiArray output.
      var detections: MLMultiArray?
      for name in output.featureNames {
        if let arr = output.featureValue(for: name)?.multiArrayValue,
           arr.shape.count == 3, arr.shape[2].intValue == 57 {
          detections = arr
          break
        }
      }
      guard let dets = detections, dets.shape.count == 3 else {
        continue
      }
      // Shape is [1, N, 57]. We want the highest-scoring detection;
      // end2end=True means N is already sorted by score.
      let numDets = dets.shape[1].intValue
      if numDets == 0 { continue }

      // Read row 0 only.
      var bestRow: [Double] = []
      bestRow.reserveCapacity(57)
      for c in 0..<57 {
        let v = Double(truncating: dets[[0, 0, c] as [NSNumber]])
        bestRow.append(v)
      }
      let score = bestRow[4]
      let kpRaw = Array(bestRow[6..<57])

      let keypoints = decodeYoloKeypoints(
        kpRaw: kpRaw,
        score: score,
        scaledW: scaledW,
        scaledH: scaledH,
        padX: padX,
        padY: padY
      )
      let meanConf = keypoints.reduce(0.0) { $0 + ($1["confidence"] as? Double ?? 0) }
        / Double(keypoints.count)

      poses.append([
        "frame": idx,
        "timestampMs": Int(CMTimeGetSeconds(actual) * 1000),
        "keypoints": keypoints,
        "score": score >= yoloScoreThreshold ? meanConf : 0.0
      ])
    }

    return [
      "fps": targetFps,
      "widthPx": Int(origW),
      "heightPx": Int(origH),
      "poses2D": poses,
      "modelTag": yoloModelTag
    ]
  }

  /// Convert a 51-element raw keypoint vector (17 × [x, y, v]) in
  /// 640-px letterboxed space to the 17-COCO contract: x,y in [0,1] of
  /// the *original* video frame, confidence in [0,1].
  ///
  /// When the detection score is below threshold the entire pose is
  /// zeroed out — half-confident phantom climbers break phase
  /// segmentation worse than admitting "no detection".
  private static func decodeYoloKeypoints(
    kpRaw: [Double],
    score: Double,
    scaledW: Double,
    scaledH: Double,
    padX: Double,
    padY: Double
  ) -> [[String: Any]] {
    var out: [[String: Any]] = []
    out.reserveCapacity(17)
    if score < yoloScoreThreshold {
      for _ in 0..<17 {
        out.append(["x": 0.0, "y": 0.0, "confidence": 0.0])
      }
      return out
    }
    for i in 0..<17 {
      let kx = kpRaw[i * 3]
      let ky = kpRaw[i * 3 + 1]
      let kv = kpRaw[i * 3 + 2]
      // Map letterboxed 640-px coords back to original frame, then
      // normalize to [0, 1]. Anything outside the original frame
      // bounds is clamped — happens at extreme poses where the
      // network extrapolates a keypoint into the letterbox bars.
      let xInOrig = (kx - padX) / scaledW
      let yInOrig = (ky - padY) / scaledH
      let xClamped = max(0.0, min(1.0, xInOrig))
      let yClamped = max(0.0, min(1.0, yInOrig))
      let conf = max(0.0, min(1.0, kv))
      out.append([
        "x": xClamped,
        "y": yClamped,
        "confidence": conf
      ])
    }
    return out
  }
}

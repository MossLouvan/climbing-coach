Pod::Spec.new do |s|
  s.name           = 'ClimbingPose'
  s.version        = '0.1.0'
  s.summary        = 'Apple Vision + YOLO-Pose pose detection for recorded climbing video.'
  s.description    = s.summary
  s.author         = ''
  s.homepage       = 'https://example.com'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'

  # Bundle the YOLO-Pose CoreML weights produced by
  # scripts/export/export_coreml.py. Xcode picks up `.mlpackage` files
  # in `resources` and auto-compiles them to `.mlmodelc` inside the app
  # bundle, so the Swift side just resolves the compiled form via
  # Bundle(for: ClimbingPoseModule.self). The weights file is
  # intentionally NOT in git (*.mlpackage in .gitignore); when it is
  # missing the build still succeeds, isYoloPoseAvailable() returns
  # false, and the JS resolver falls back to Vision/Mock.
  s.resources = ['weights/**/*.mlpackage']
end

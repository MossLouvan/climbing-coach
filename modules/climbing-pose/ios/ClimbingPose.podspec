Pod::Spec.new do |s|
  s.name           = 'ClimbingPose'
  s.version        = '0.1.0'
  s.summary        = 'Apple Vision pose detection for recorded climbing video.'
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
end

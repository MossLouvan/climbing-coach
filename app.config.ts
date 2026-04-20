import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Climbing Coach',
  slug: 'climbing-coach',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'climbingcoach',
  userInterfaceStyle: 'automatic',
  assetBundlePatterns: ['**/*'],
  ios: {
    bundleIdentifier: 'dev.mosslouvan.climbingcoach',
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription:
        'Record your climbing attempts so the app can analyze your technique.',
      NSMicrophoneUsageDescription:
        'Record audio alongside your climbing attempts (optional).',
      NSPhotoLibraryUsageDescription:
        'Upload previously recorded climbing videos for analysis.',
      NSPhotoLibraryAddUsageDescription:
        'Save analyzed clips back to your photo library.',
    },
  },
  android: {
    package: 'dev.mosslouvan.climbingcoach',
  },
  plugins: [
    'expo-asset',
    'expo-sqlite',
    'expo-video',
    [
      'expo-camera',
      {
        cameraPermission: 'Allow Climbing Coach to use your camera to record attempts.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow Climbing Coach to access your videos for analysis.',
      },
    ],
    [
      'expo-media-library',
      {
        photosPermission: 'Allow Climbing Coach to save and read climbing videos.',
        savePhotosPermission: 'Allow Climbing Coach to save analyzed clips to your library.',
        isAccessMediaLocationEnabled: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
  },
  extra: {
    // V1 is local-first; no cloud backend URL required.
    buildProfile: process.env.EXPO_PUBLIC_BUILD_PROFILE ?? 'dev',
    // Hugging Face inputs for wall detection. See src/config/env.ts for
    // the full setup instructions.
    hfApiKey: process.env.EXPO_PUBLIC_HF_API_KEY,
    hfCaptionModel: process.env.EXPO_PUBLIC_HF_CAPTION_MODEL,
  },
});

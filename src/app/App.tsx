import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { RootNavigator } from './navigation/RootNavigator';
import { useAppStore } from './store/appStore';
import { colors, spacing, typography } from './theme/tokens';

export default function App(): React.ReactElement {
  const readyState = useAppStore((s) => s.readyState);
  const ensureReady = useAppStore((s) => s.ensureReady);
  const lastError = useAppStore((s) => s.lastError);

  useEffect(() => {
    if (readyState === 'uninitialized') void ensureReady();
  }, [readyState, ensureReady]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {readyState !== 'ready' ? (
        <View style={styles.splash}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[typography.body, { marginTop: spacing.m }]}>
            {readyState === 'initializing' ? 'Preparing your climbing coach…' : 'Starting up…'}
          </Text>
          {lastError && (
            <Text style={[typography.label, { color: colors.bad, marginTop: spacing.s }]}>
              {lastError}
            </Text>
          )}
        </View>
      ) : (
        <RootNavigator />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
  },
});

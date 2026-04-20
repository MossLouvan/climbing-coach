import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';

import { HomeScreen } from '../screens/HomeScreen';
import { RecordScreen } from '../screens/RecordScreen';
import { UploadScreen } from '../screens/UploadScreen';
import { HoldTagScreen } from '../screens/HoldTagScreen';
import { AnalysisScreen } from '../screens/AnalysisScreen';
import { SessionDetailScreen } from '../screens/SessionDetailScreen';
import { CompareScreen } from '../screens/CompareScreen';
import { colors } from '../theme/tokens';

import type { SessionId } from '@domain/models';

export type RootStackParamList = {
  Tabs: undefined;
  HoldTag: undefined;
  Analysis: { sessionId: SessionId } | undefined;
  SessionDetail: { sessionId: SessionId };
  Compare: { a: SessionId; b?: SessionId };
};

export type TabParamList = {
  Home: undefined;
  Record: undefined;
  Upload: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

function TabNavigator(): React.ReactElement {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgElevated },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.bgElevated, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
      }}
    >
      <Tabs.Screen name="Home" component={HomeScreen} options={{ title: 'Sessions' }} />
      <Tabs.Screen name="Record" component={RecordScreen} options={{ title: 'Record' }} />
      <Tabs.Screen name="Upload" component={UploadScreen} options={{ title: 'Upload' }} />
    </Tabs.Navigator>
  );
}

export function RootNavigator(): React.ReactElement {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.bgElevated },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
        <Stack.Screen name="HoldTag" component={HoldTagScreen} options={{ title: 'Tag Holds' }} />
        <Stack.Screen name="Analysis" component={AnalysisScreen} options={{ title: 'Analysis' }} />
        <Stack.Screen
          name="SessionDetail"
          component={SessionDetailScreen}
          options={{ title: 'Session' }}
        />
        <Stack.Screen
          name="Compare"
          component={CompareScreen}
          options={{ title: 'Compare' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

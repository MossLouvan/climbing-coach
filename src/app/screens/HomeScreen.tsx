import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppStore } from '../store/appStore';
import { colors, radius, scoreColor, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/RootNavigator';

import type { Session } from '@domain/models';

export function HomeScreen(): React.ReactElement {
  const sessions = useAppStore((s) => s.sessions);
  const user = useAppStore((s) => s.user);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const progressSeries = useMemo(
    () => sessions.slice().reverse().map((s) => s.report?.overall ?? null),
    [sessions],
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={typography.title}>
          {user ? `Hi, ${user.displayName}` : 'Climbing Coach'}
        </Text>
        <Text style={[typography.label, { marginTop: spacing.xs }]}>
          {sessions.length} session{sessions.length === 1 ? '' : 's'} recorded.
        </Text>
        <ProgressSparkline scores={progressSeries} />
      </View>
      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: spacing.l, gap: spacing.m }}
        ListEmptyComponent={
          <Text style={[typography.body, { color: colors.textDim, textAlign: 'center' }]}>
            No sessions yet. Record or upload a climb to get started.
          </Text>
        }
        renderItem={({ item }) => (
          <SessionCard
            session={item}
            onPress={() => nav.navigate('SessionDetail', { sessionId: item.id })}
          />
        )}
      />
    </View>
  );
}

function SessionCard({
  session,
  onPress,
}: {
  session: Session;
  onPress: () => void;
}): React.ReactElement {
  const overall = session.report?.overall ?? 0;
  const badge = session.note === 'demo-seed' ? 'Demo' : session.source === 'live_recording' ? 'Recorded' : 'Uploaded';
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={typography.subtitle}>
            {new Date(session.createdAtMs).toLocaleString()}
          </Text>
          <Text style={[typography.label, { marginTop: 2 }]}>{badge} · {session.status}</Text>
        </View>
        <View style={[styles.scorePill, { borderColor: scoreColor(overall) }]}>
          <Text style={[typography.subtitle, { color: scoreColor(overall) }]}>
            {Math.round(overall)}
          </Text>
        </View>
      </View>
      {session.report?.tips[0] && (
        <Text style={[typography.body, { color: colors.textDim, marginTop: spacing.s }]}>
          {session.report.tips[0].message}
        </Text>
      )}
    </Pressable>
  );
}

function ProgressSparkline({ scores }: { scores: Array<number | null> }): React.ReactElement | null {
  if (scores.length < 2) return null;
  const valid = scores.filter((s): s is number => typeof s === 'number');
  if (valid.length < 2) return null;
  const max = 100;
  const min = 0;
  return (
    <View style={styles.sparkline}>
      {scores.map((s, i) => {
        const h = typeof s === 'number' ? ((s - min) / (max - min)) * 40 : 4;
        return (
          <View
            key={i}
            style={{
              width: 6,
              height: Math.max(4, h),
              backgroundColor: typeof s === 'number' ? scoreColor(s) : colors.border,
              marginRight: 3,
              borderRadius: 2,
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    padding: spacing.l,
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 44,
    marginTop: spacing.m,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.l,
    padding: spacing.l,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scorePill: {
    borderWidth: 2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
  },
});

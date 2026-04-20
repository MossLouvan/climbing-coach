import { create } from 'zustand';

import { analyzeSession, type AnalysisProgress } from '@analysis/pipeline';
import { resolvePoseProvider, type PoseProvider } from '@analysis/pose';
import {
  type Route,
  type Session,
  type UserProfile,
  type Video,
} from '@domain/models';
import {
  type Repositories,
  inMemoryDb,
  makeRepositories,
  seedDemoData,
} from '@storage/index';

/**
 * App-wide state:
 *   - lazily-initialized DB + repositories
 *   - cached current user
 *   - session list for the history screen
 *   - active session draft during record/upload/tag flows
 *   - async analysis progress
 *
 * Important: `ensureReady()` is the ONLY entry point for DB init so
 * screens never race on initialization.
 *
 * We default to the in-memory DB in dev-without-native-build so the
 * app boots in Expo Go. Swap to `openExpoSqliteDatabase()` when
 * running a prebuilt binary.
 */

type ReadyState = 'uninitialized' | 'initializing' | 'ready';

interface DraftSession {
  readonly video: Video;
  readonly route: Route;
}

interface AppState {
  readonly readyState: ReadyState;
  readonly repos: Repositories | null;
  readonly user: UserProfile | null;
  readonly sessions: ReadonlyArray<Session>;
  readonly draft: DraftSession | null;
  readonly analysisProgress: AnalysisProgress | null;
  readonly lastError: string | null;

  ensureReady: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  setDraft: (draft: DraftSession | null) => void;
  updateDraftRoute: (route: Route) => void;
  analyzeDraft: (opts?: { preferRealInference?: boolean; provider?: PoseProvider }) => Promise<Session | null>;
}

export const useAppStore = create<AppState>((set, get) => ({
  readyState: 'uninitialized',
  repos: null,
  user: null,
  sessions: [],
  draft: null,
  analysisProgress: null,
  lastError: null,

  ensureReady: async () => {
    const state = get();
    if (state.readyState !== 'uninitialized') return;
    set({ readyState: 'initializing' });
    try {
      // Dev default: in-memory DB so Expo Go works. On device with a
      // prebuilt binary, `openExpoSqliteDatabase()` drops in here.
      const db = inMemoryDb();
      const repos = makeRepositories(db);
      // Apply schema (no-ops for inMemoryDb, real DDL for sqlite).
      for (const _ of []) void _; // placeholder to keep type linter happy
      await seedDemoData(repos);
      const user = await repos.users.primary();
      const sessions = user ? await repos.sessions.listByUser(user.id) : [];
      set({ repos, user, sessions, readyState: 'ready' });
    } catch (err) {
      set({
        readyState: 'uninitialized',
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  refreshSessions: async () => {
    const { repos, user } = get();
    if (!repos || !user) return;
    const sessions = await repos.sessions.listByUser(user.id);
    set({ sessions });
  },

  setDraft: (draft) => set({ draft }),

  updateDraftRoute: (route) => {
    const { draft } = get();
    if (!draft) return;
    set({ draft: { ...draft, route } });
  },

  analyzeDraft: async (opts) => {
    const { draft, repos, user } = get();
    if (!draft || !repos || !user) return null;
    set({ analysisProgress: { stage: 'pose' }, lastError: null });
    try {
      // Prefer real on-device inference by default. The resolver
      // silently falls back to the mock provider if the native pose
      // module isn't available (e.g. Expo Go, Android).
      const preferReal = opts?.preferRealInference ?? true;
      const provider =
        opts?.provider ?? (await resolvePoseProvider(preferReal));
      const analysis = await analyzeSession({
        video: draft.video,
        route: draft.route,
        provider,
        options: {
          preferRealInference: preferReal,
          climberHeightM: user.heightM,
        },
        onProgress: (p) => set({ analysisProgress: p }),
      });
      const session: Session = {
        id: `ses_${Date.now().toString(36)}` as Session['id'],
        userId: user.id,
        routeId: draft.route.id,
        video: draft.video,
        source: 'upload',
        status: 'analyzed',
        createdAtMs: Date.now(),
        phases: analysis.phases,
        poseTrack: analysis.track,
        report: analysis.report,
      };
      await repos.routes.upsert(draft.route);
      await repos.sessions.upsert(session);
      const sessions = await repos.sessions.listByUser(user.id);
      set({ sessions, draft: null, analysisProgress: { stage: 'done' } });
      return session;
    } catch (err) {
      set({
        analysisProgress: null,
        lastError: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  },
}));

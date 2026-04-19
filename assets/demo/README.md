# Demo assets

The app ships with a seeded demo session that uses this directory for
placeholder visuals:

- `demo_climb.mp4` — a placeholder URI referenced by the seeded Session.
  The analysis screen detects this seeded session (by
  `session.note === 'demo-seed'`) and renders a static "Demo session"
  panel instead of trying to play a real video file, so we do not ship
  a binary video in the repo.
- `demo_climb_thumb.jpg` — likewise a placeholder reference only.

If you want to bundle a real demo clip:

1. Drop the video and thumbnail in this directory.
2. Update `src/storage/seeds/seedLoader.ts` so the demo `Video` uses
   the asset URIs resolved via `expo-asset`.
3. Remove the "demo-seed" short-circuit in `SessionDetailScreen.tsx`.

Keeping this directory empty by default keeps the repo size small and
avoids committing binary sample footage of real people.

import { SONGS, type Room } from "@godc/shared";

/**
 * The room chooses what it is going to play.
 *
 * Live counts rather than a sealed ballot: watching the numbers move is half the
 * point, and it lets people pile onto something once they see it has momentum.
 * Anyone may change their mind — the last vote per person counts.
 *
 * No result is ever announced as a defeat. The winning piece simply becomes what
 * the room does next.
 */
export function SongVote({
  room,
  youId,
  onVote,
}: {
  room: Room;
  youId: string | null;
  onVote: (songId: string) => void;
}) {
  const tally = new Map<string, number>();
  for (const songId of Object.values(room.votes)) {
    tally.set(songId, (tally.get(songId) ?? 0) + 1);
  }
  const myVote = youId ? room.votes[youId] : undefined;
  const most = Math.max(1, ...[...tally.values()]);

  return (
    <div className="flex w-full flex-col gap-1.5">
      {SONGS.map((song) => {
        const count = tally.get(song.id) ?? 0;
        const mine = myVote === song.id;
        return (
          <button
            key={song.id}
            type="button"
            onClick={() => onVote(song.id)}
            className={`relative overflow-hidden rounded-xl border px-4 py-3 text-left transition ${
              mine ? "border-top/70 bg-top/10" : "border-cream/14 hover:border-cream/30"
            }`}
          >
            {/* The bar is the tally. It never labels a winner or a loser. */}
            <span
              className="absolute inset-y-0 left-0 bg-top/[0.09] transition-[width] duration-500"
              style={{ width: `${(count / most) * 100}%` }}
            />
            <span className="relative flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-display text-[19px] leading-tight">
                  {song.name}
                </span>
                <span className="block truncate text-[11.5px] text-cream/45">
                  {song.description}
                </span>
              </span>
              <span className="flex flex-none items-baseline gap-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-cream/35">
                  {song.bpm} bpm · {song.cycleBeats}
                </span>
                <span
                  className={`min-w-5 text-right font-display text-lg ${
                    count > 0 ? "text-top" : "text-cream/25"
                  }`}
                >
                  {count}
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

import { FAMILY_COLOR, SONGS, getInstrument } from "@godc/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { InstrumentIcon } from "@/components/InstrumentIcon";
import { InviteLink } from "@/components/InviteLink";
import { Notice } from "@/components/Notice";
import { SongVote } from "@/components/SongVote";
import { Screen } from "@/components/Screen";
import { useIsHost, useSessionStore } from "@/state/sessionStore";

/**
 * The lobby.
 *
 * Sound does not start the moment the first person arrives. The host waits for
 * stragglers here, so the room begins together rather than fading up out of a
 * half-empty groove — which matters when the whole point is that everyone is in
 * one place at one time.
 *
 * Each arrival blooms into the ring. Watching the circle fill is the first
 * thing that tells a participant this is a group activity.
 */
export function LobbyScreen() {
  const room = useSessionStore((s) => s.room);
  const youId = useSessionStore((s) => s.youId);
  const begin = useSessionStore((s) => s.beginSession);
  const voteSong = useSessionStore((s) => s.voteSong);
  const endSession = useSessionStore((s) => s.endSession);
  const leave = useSessionStore((s) => s.leave);
  const isHost = useIsHost();
  const navigate = useNavigate();
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  function goHome() {
    leave();
    navigate("/", { replace: true });
  }

  if (!room) return null;

  const people = room.participants;
  const radius = 130;
  const voting = room.mode === "song" && !room.songId;

  // Whichever piece is ahead, by the same rule the server uses.
  const leader = (() => {
    const tally = new Map<string, number>();
    for (const songId of Object.values(room.votes)) {
      tally.set(songId, (tally.get(songId) ?? 0) + 1);
    }
    let best = SONGS[0];
    let most = -1;
    for (const song of SONGS) {
      const n = tally.get(song.id) ?? 0;
      if (n > most) {
        most = n;
        best = song;
      }
    }
    return best;
  })();

  if (voting) {
    return (
      <Screen scroll className="items-center px-6">
        <Notice />
        <p className="mt-2 pl-1.5 text-[11.5px] uppercase tracking-[0.42em] text-gold">
          What shall we play?
        </p>
        <p className="mb-5 mt-2 text-[12.5px] text-cream/45">
          {people.length} in the circle · tap to vote, change your mind freely
        </p>

        <div className="mb-4 w-full">
          <InviteLink room={room} />
        </div>
        <SongVote room={room} youId={youId} onVote={voteSong} />

        <div className="sticky bottom-0 mt-6 w-full bg-gradient-to-t from-ink via-ink/90 to-transparent pb-2 pt-4">
          {isHost ? (
            <>
              <Button className="w-full" onClick={begin}>
                Play {leader.name}
              </Button>
              <p className="mt-2.5 text-center text-[11px] text-cream/35">
                everyone gets a part · cues fade as you find it
              </p>
            </>
          ) : (
            <p className="godc-breathe text-center text-[13px] text-cream/50">
              the host will start us off
            </p>
          )}
        </div>
      </Screen>
    );
  }

  return (
    <Screen className="items-center px-0">
      <Notice />
      <p className="mt-4 pl-1.5 text-[11.5px] uppercase tracking-[0.42em] text-gold">
        The circle is gathering
      </p>

      <div className="relative my-auto h-[340px] w-[340px]">
        {people.map((participant, i) => {
          const instrument = participant.instrumentId
            ? getInstrument(participant.instrumentId)
            : undefined;
          const color = instrument ? FAMILY_COLOR[instrument.family] : "#6b6072";
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / people.length;
          const size = people.length <= 14 ? 40 : people.length <= 30 ? 30 : 22;
          const isYou = participant.id === youId;

          return (
            <div
              key={participant.id}
              className="godc-bloom absolute"
              style={{
                left: `${170 + radius * Math.cos(angle)}px`,
                top: `${170 + radius * Math.sin(angle)}px`,
                transform: "translate(-50%, -50%)",
                // Stagger so the ring fills round rather than appearing at once.
                animationDelay: `${Math.min(i * 0.06, 1.4)}s`,
              }}
            >
              <div
                className="mx-auto flex items-center justify-center rounded-full"
                style={{
                  width: size,
                  height: size,
                  background: color,
                  boxShadow: isYou
                    ? `0 0 0 2px #f6ecd9, 0 0 18px ${color}`
                    : `0 0 14px ${color}66`,
                }}
              >
                {instrument && size >= 30 && (
                  <InstrumentIcon
                    instrumentId={instrument.id}
                    color="#140c26"
                    size={size * 0.8}
                    strokeWidth={3.6}
                  />
                )}
              </div>
              {people.length <= 18 && (
                <p className="mt-1.5 whitespace-nowrap text-center text-[10px] text-cream/60">
                  {isYou ? "You" : participant.name}
                </p>
              )}
            </div>
          );
        })}

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="font-display text-[56px] leading-none">{people.length}</p>
          <p className="mt-1.5 pl-1 text-[11px] uppercase tracking-[0.36em] text-cream/50">
            in the circle
          </p>
        </div>
      </div>

      <div className="mb-4 w-full max-w-[420px] px-5">
        <InviteLink room={room} />
      </div>

      {isHost ? (
        <>
          <Button className="px-14" onClick={begin}>
            Begin
          </Button>
          {/* The circle belongs to whoever opened it, before it starts as well
              as after. Without this, a room opened by mistake cannot be shut. */}
          {confirmClose ? (
            <div className="mt-4 flex items-center gap-4">
              <button
                type="button"
                onClick={endSession}
                className="rounded-full border border-bass/50 px-5 py-2 text-[12px] tracking-[0.06em] text-bass/90"
              >
                yes, close it
              </button>
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                className="text-[12px] text-cream/45 underline underline-offset-4"
              >
                keep gathering
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClose(true)}
              className="mt-4 text-[12px] text-cream/40 underline underline-offset-4"
            >
              close this circle
            </button>
          )}
        </>
      ) : (
        <>
          <p className="godc-breathe text-[13px] text-cream/50">
            the host will begin soon
          </p>
          {/* Anyone can walk away from a circle they have not joined in on. */}
          {confirmLeave ? (
            <div className="mt-4 flex items-center gap-4">
              <button
                type="button"
                onClick={goHome}
                className="rounded-full border border-bass/50 px-5 py-2 text-[12px] tracking-[0.06em] text-bass/90"
              >
                yes, leave
              </button>
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className="text-[12px] text-cream/45 underline underline-offset-4"
              >
                stay
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              className="mt-4 text-[12px] text-cream/40 underline underline-offset-4"
            >
              leave the circle
            </button>
          )}
        </>
      )}
      <p className="mt-4 text-[11.5px] uppercase tracking-[0.3em] text-cream/35">
        room {room.code}
        {isHost && <span className="ml-2 text-cream/25">· you opened it</span>}
      </p>
    </Screen>
  );
}

import { Route, Routes, useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { ClosingScreen } from "@/screens/ClosingScreen";
import { InstrumentScreen } from "@/screens/InstrumentScreen";
import { JoinScreen } from "@/screens/JoinScreen";
import { Landing } from "@/screens/Landing";
import { LoadingScreen } from "@/screens/LoadingScreen";
import { LobbyScreen } from "@/screens/LobbyScreen";
import { PlayScreen } from "@/screens/PlayScreen";
import { SoundCheckScreen } from "@/screens/SoundCheckScreen";
import { useSessionStore } from "@/state/sessionStore";

/**
 * Routing is only for entry.
 *
 * A room is a link, so "/", "/start" and "/r/:code" are real URLs. Once someone
 * is in, the screen follows session phase rather than history: a participant who
 * hits back mid-session should not silently leave the circle.
 */
export default function App() {
  const phase = useSessionStore((s) => s.phase);
  const error = useSessionStore((s) => s.error);
  const leave = useSessionStore((s) => s.leave);
  const navigate = useNavigate();

  switch (phase) {
    case "connecting":
      return (
        <Screen className="items-center justify-center">
          <p className="godc-breathe text-cream/60">Finding the circle…</p>
        </Screen>
      );
    case "error":
      return (
        <Screen className="items-center justify-center gap-6 px-8 text-center">
          <p className="max-w-xs text-cream/70">{error ?? "Something went wrong."}</p>
          <Button
            variant="outline"
            onClick={() => {
              leave();
              navigate("/", { replace: true });
            }}
          >
            Try again
          </Button>
        </Screen>
      );
    case "loading":
      return <LoadingScreen />;
    case "soundcheck":
      return <SoundCheckScreen />;
    case "choosing":
      return <InstrumentScreen />;
    case "lobby":
      return <LobbyScreen />;
    case "playing":
      return <PlayScreen />;
    case "ended":
      return <ClosingScreen />;
    default:
      return (
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/start" element={<JoinScreen hosting />} />
          <Route path="/join" element={<JoinScreen />} />
          <Route path="/r/:code" element={<JoinScreen />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      );
  }
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { Mandala } from "@/components/Mandala";
import { Screen } from "@/components/Screen";

/**
 * The first thing anyone sees.
 *
 * The name carries the page. It is set in the display face at a size that fills
 * the width of a phone, with the warm gradient the buttons use — so the thing
 * people were told to open is unmistakably the thing in front of them.
 *
 * One promise and one button. The name field and the size question both wait
 * for the next screen: a landing page that opens with a form is asking for
 * commitment before it has said what it is.
 */
export function Landing() {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  return (
    <Screen className="items-center justify-center px-7 text-center">
      <Mandala size={124} animated={!leaving} />

      <h1 className="mt-7 font-display leading-[0.92]">
        <span
          className="block text-cream/80"
          style={{ fontSize: "clamp(1.7rem, 7.5vw, 2.4rem)" }}
        >
          Goddess of
        </span>
        <span
          className="block bg-gradient-to-br from-gold via-rhythm to-bass bg-clip-text text-transparent"
          style={{ fontSize: "clamp(3.1rem, 13.5vw, 4.4rem)" }}
        >
          Drum Circle
        </span>
      </h1>

      <p className="mt-5 font-display text-[19px] tracking-[0.01em] text-cream/90">
        Jam together, build memories
      </p>
      <p className="mt-2.5 max-w-[260px] text-[13.5px] leading-relaxed text-cream/45 text-pretty">
        Sit down. Tap. Nobody can play a wrong note here.
      </p>

      <Button
        className="mt-9"
        onClick={() => {
          setLeaving(true);
          navigate("/start");
        }}
      >
        Start a Circle
      </Button>
      <Button variant="quiet" className="mt-5" onClick={() => navigate("/join")}>
        or join with a link
      </Button>
    </Screen>
  );
}

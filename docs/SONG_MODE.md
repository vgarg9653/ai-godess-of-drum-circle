# Song mode

A room can start from an arrangement instead of from nothing. The group votes on
a piece; its tempo, metre, mood and key become the room's, and everyone is given
a part and cued into it. Cues fade person by person. Once everyone is released
the room simply *is* a free jam, in the world of that piece.

**Recognition, then release.** Nobody follows cues for a whole session.

## Nothing of the original is played

A "song" here is a set of musical decisions plus a handful of rhythmic patterns.
The room plays its own instruments. No recording is streamed, stored or
reproduced.

The first catalogue is traditional and public-domain — Keherwa, Teental, Rupak,
Kuku, Bhangra, Garba, Dhol Tasha, Kirtan. That is partly licensing: titles and
tempi are not protectable but melodic hooks are. It is mostly musical, though.
A bhangra dhol pattern feels like every Punjabi wedding song without being any
of them, and for a drum circle the groove is what a room responds to. These
forms are *already* interlocking ensemble music, which is the mechanism below.

Named commercial tracks would need a sync licence. The data format would not
change.

## The problem interlocking solves

A pattern is fixed. A room is not — it may hold five people or sixty. The
density cap tightens as the room grows:

| Room | Onsets allowed per person (8-beat cycle) |
| --- | --- |
| 5 | 11 |
| 12 | 7 |
| 30 | 3 |
| 60 | 3 |

A song pattern has six to ten hits. **In a thirty-person room one person cannot
play their part.** And if everyone in a role played the whole pattern anyway,
sixty phones would produce exactly the mud the brief exists to prevent — while
twelve identical loops comb-filtered against each other and nobody had a part of
their own.

So a role's pattern is **shared out** among the people playing it. Together they
play the whole thing; individually each plays a few hits. It scales by
subdividing rather than by thinning.

```
5 people (cap 11)                   30 people (cap 3)
Keep the beat #1  X·······X·······   Keep the beat #1  X·······X·······
The low boom #1   X···········o···   Keep the beat #2  X···············X
In the gaps #1    ····o·······X···   The low boom #1   X···········o···
Fast and light #1 ··X···X···X···X·   Fast and light #1 ··X·············
ROOM HEARS        ▓·▓·▓·▓·▓·▓·▓·▓·   ROOM HEARS        ▓·▓·▓·▓·▓·▓·▓·▓·
```

Three properties fall out of this:

- **The room can't fall silent at the handoff.** Nobody owns the pattern, so
  nobody drifting or leaving can take it away.
- **Everyone has something of their own**, so the room is an ensemble rather
  than a chorus of clones.
- **Sparse parts are easier to learn**, which makes the cued phase short.

### Anchors

Hits marked `anchor` go to *everyone* in the role rather than being shared out.
Reserved for the hits that hold the cycle together — usually beat one. A room
where a single person plays the downbeat has a fragile pulse.

Not every role is anchored, on purpose: the offbeat parts exist precisely to
avoid the downbeat, and anchoring them would put that whole section on beat one.
What must hold is narrower — the two highest-priority roles, the ones a
five-person room actually receives, have to carry the cycle.

The **"Clap along"** role inverts this: every hit is anchored, so it is the one
part deliberately *not* split up. Unison clapping is the point, and it gives
everyone in a large room something they already know how to do.

### The authoring rule

No pattern may exceed **the density cap at eight people**. That is the worst
case: the cap has tightened to eight onsets while roles still hold only one
member each. Enforced by test.

This was learned the hard way. Dhol Tasha's authentic twelve-stroke tasha roll
silently lost a hit at five people, and the pattern stopped being the pattern.
It is now eight, grouped 3+3+2. **The density guarantee outranks the
arrangement** — it is a promise to the room, not a preference.

Any generated arrangement has to pass the same check.

## Roles fit instruments, not the reverse

People choose and preview an instrument *before* the room votes. So the role is
fitted to the instrument they are already holding — handing a bansuri player the
low boom would make nonsense of both. `assignRole` takes a family preference and
falls back to any role when the piece has none of that family.

Five to seven roles, filled in priority order, so a room of five still sounds
like the piece.

## The lesson is Simon Says

The part loops in full from the first bar, but only **one hit is ever asked
for**. Find it and the lesson moves on. A four-hit part is learned as four
one-hit lessons, and the room hears the complete arrangement throughout.

`registerTap` credits only the hit being taught. Otherwise somebody tapping
steadily would quietly satisfy hits nobody had shown them, and the lesson would
run ahead of what they had actually learned.

Simon Says is the right model for one reason above all: **it never tells you
that you were bad.** It shows you *when*, and nothing else — which is precisely
the only feedback this app permits.

On screen: your instrument is the large disc in the middle, a ring closes in as
your hit approaches, and the disc lights up as it lands. "Tap when it lights
up." That is the whole instruction.

## Cues, and letting go of them

The part **loops from the first bar**. The player is not building it; they are
being invited to join something already sounding. That is what guarantees the
room is full immediately and never drops out when cues later fade.

While cued, a tap sounds instantly *on top of* the part and does not edit it.
The loop keeps playing whatever the player does. Hearing your tap land beside
your own part — or exactly on it — is how a person finds a groove, and it is the
instrument behaving like an instrument rather than a score.

Two ways out, and deliberately no way to tell them apart:

- **Found it.** A hit tapped within 1.5 steps on two separate cycles releases.
- **Time.** Everything remaining releases after 8 cycles, plus a stable 0–2
  cycle stagger per person so a room does not all come free on the same bar.

Because a cue *fades* rather than switching off, both feel identical from the
inside: "the cues went away as I got it." Nobody — including the player — can
tell which happened. **There is no way to fail, and nothing to compare.**

Release is per hit, not all at once: as one hit is found, that pip stops being
drawn while the others remain. Someone with three hits watches them go one by
one. Nothing is ever re-cued.

### What is deliberately absent

No scores, streaks, combos, accuracy, "good", or counts of how much has been
found. Not during, not after. Cue state is **local to the phone** — never sent,
never stored, never compared. How long somebody took to find their part is
nobody else's business, including the server's.

## On the wire

Protocol v3. The arrangement itself never travels: every client already ships
the catalogue, so `songId` + `roleId` + `rolePart` is enough to derive the part.
That keeps the wire small and cue state where it belongs.

| Added | |
| --- | --- |
| `Room.mode` | `"jam" \| "song"` |
| `Room.songId`, `Room.votes` | chosen piece, and raw votes by participant |
| `Participant.roleId`, `.rolePart` | which part, and which slice of it |
| `TransportState.rootMidi?` | key override; moods alone cannot express every key |
| `song:vote` → | cast or change a vote, lobby only |
| ← `song:votes` | the tally moved |
| ← `song:chosen` | the piece is settled; parts for everyone |

## Still open

- **Nothing here has been verified in a browser.** The Chrome extension was
  disconnected when it was built, so the flow was exercised headlessly through
  the mock server instead. The logic is covered; how it *feels* is not.
- `CUE_MAX_CYCLES = 8` is an instinct, not a measurement — long enough to learn
  two or three hits, short enough that cues are gone inside the first minute.
  Worth tuning with real people in a real room.
- Host controls are not yet locked during the cued phase; changing tempo or mood
  mid-arrangement would fight the piece.
- A room that fills up *after* the song is chosen assigns roles on join; late
  joiners are cued and released like everyone else, but that path is untested.

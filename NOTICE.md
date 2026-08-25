# Notice — bundled audio is licensed separately

[`LICENSE`](LICENSE) (MIT) covers the **source code** in this repository.

It does **not** cover the audio in `frontend/public/samples/`. Those files are
derived from third-party sample libraries and keep their own terms:

| What | Source | Licence |
| --- | --- | --- |
| All unpitched percussion | [VCSL](https://github.com/sgossner/VCSL) | CC0 1.0 Universal |
| All pitched voices | [FluidR3_GM via midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) | MIT, © 2012 Benjamin Gleitzman |

Full licence texts are in [`licenses/`](licenses/). Per-instrument attribution
is generated into `frontend/public/samples/CREDITS.md`; the sources it comes
from are declared in [`tools/sample-sources.json`](tools/sample-sources.json).

**CC0 asks for nothing. MIT requires that the copyright notice travel with the
work** — which is why `licenses/FluidR3_GM-midi-js-soundfonts-MIT.txt` exists
and must not be deleted if you redistribute the audio.

Neither library imposes a non-commercial restriction, so this set is safe to
use in a paid retreat or workshop.

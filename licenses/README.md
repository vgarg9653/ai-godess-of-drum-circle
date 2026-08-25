# Third-party licences

The audio in `frontend/public/samples/` is derived from two upstream sample
sets. Both licences are reproduced here in full because this repository
redistributes that audio (re-encoded to mono MP3 — see
`tools/fetch-samples.mjs`).

| File | Covers | Licence |
| --- | --- | --- |
| `VCSL-CC0-1.0.txt` | All unpitched percussion | CC0 1.0 Universal |
| `FluidR3_GM-midi-js-soundfonts-MIT.txt` | All pitched voices | MIT |

CC0 waives all rights and asks for nothing. **MIT requires that the copyright
notice travel with the work**, which is why the second file exists and must not
be removed.

Per-instrument attribution is generated into
`frontend/public/samples/CREDITS.md` by `tools/fetch-samples.mjs`. Do not edit
that file by hand; change `tools/sample-sources.json` instead.

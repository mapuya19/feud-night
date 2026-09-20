# Sound credits

All clips are served from `public/sfx/` and sourced from [Mixkit](https://mixkit.co)
under the [Mixkit Sound Effects Free License](https://mixkit.co/license/sfx-free/)
(free for commercial and non-commercial use, no attribution required; the clips
may not be redistributed as standalone audio assets — bundling them inside this
app is permitted).

| File | Source title | mixkit.co URL |
| --- | --- | --- |
| `buzz-in.mp3` | Service bell | /free-sound-effects/bell/ (id 931) |
| `correct.mp3` | Uplifting bells notification | /free-sound-effects/bell/ (id 938) |
| `strike.mp3` | Wrong long buzzer | /free-sound-effects/wrong/ (id 954) |
| `miss.mp3` | Wrong answer game show | /free-sound-effects/wrong/ (id 3219) |
| `steal.mp3` | Ominous drums | /free-sound-effects/game/ (id 227) |
| `whoosh.mp3` | Fast whoosh transition | /free-sound-effects/whoosh/ (id 1490) |
| `fanfare.mp3` | Medieval show fanfare announcement | /free-sound-effects/game/ (id 226) |
| `applause.mp3` | Ending show audience clapping | /free-sound-effects/applause/ (id 478) |
| `lobby-loop.mp3` | Pop (excerpt, looped) | /free-stock-music/tag/party/ (id 181) |

Clips were trimmed of silence, loudness-normalized to −16 LUFS, and re-encoded
as small MP3s. To swap any sound, replace the file in `public/sfx/` keeping the
same filename — see `src/lib/sfx.ts` for the playback engine and toggles.

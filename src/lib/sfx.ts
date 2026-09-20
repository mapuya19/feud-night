/**
 * Board (TV) sound engine — the TV is the speaker for the whole room.
 *
 * Browser rules honored here:
 * - Audio can only start after a user gesture, so the first tap on the board
 *   "unlocks" every clip (play muted + pause inside the gesture).
 * - Effects fire on phase transitions and board events, never on raw state
 *   pushes, so nothing double-triggers.
 * - Toggles persist in localStorage; effects default ON, music default OFF.
 */

export type SfxName =
  | "buzz-in"
  | "correct"
  | "strike"
  | "miss"
  | "steal"
  | "whoosh"
  | "fanfare"
  | "applause";

const SFX_KEY = "feud.sfx";
const MUSIC_KEY = "feud.music";
const MUSIC_VOLUME = 0.4;

const NAMES: SfxName[] = ["buzz-in", "correct", "strike", "miss", "steal", "whoosh", "fanfare", "applause"];

function stored(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
}

function store(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* private mode — sound just won't persist */
  }
}

export function isSfxOn(): boolean {
  return stored(SFX_KEY, true);
}

export function isMusicOn(): boolean {
  return stored(MUSIC_KEY, false);
}

const pool = new Map<SfxName, HTMLAudioElement>();

function effect(name: SfxName): HTMLAudioElement {
  let el = pool.get(name);
  if (!el) {
    el = new Audio(`/sfx/${name}.mp3`);
    el.preload = "auto";
    el.load();
    pool.set(name, el);
  }
  return el;
}

let unlocked = false;

/** Call from a user-gesture handler once; primes every clip for later playback. */
export function unlockSfx(): void {
  if (unlocked || typeof document === "undefined") return;
  unlocked = true;
  for (const name of NAMES) {
    const el = effect(name);
    el.muted = true;
    el.play()
      .then(() => {
        el.pause();
        el.currentTime = 0;
        el.muted = false;
      })
      .catch(() => {
        el.muted = false;
      });
  }
}

/** Fire one shot. Safe to call rapidly — each play is its own element. */
export function playSfx(name: SfxName): void {
  if (!isSfxOn()) return;
  const el = effect(name).cloneNode(true) as HTMLAudioElement;
  el.play().catch(() => {
    /* autoplay guard or missing file — stay silent */
  });
}

export function toggleSfx(): boolean {
  const next = !isSfxOn();
  store(SFX_KEY, next);
  return next;
}

let music: HTMLAudioElement | null = null;

function startMusic(): void {
  if (!music) {
    music = new Audio("/sfx/lobby-loop.mp3");
    music.loop = true;
    music.volume = MUSIC_VOLUME;
  }
  music.play().catch(() => {
    // Blocked before a gesture — retry on the next tap.
    const retry = () => {
      if (isMusicOn()) music?.play().catch(() => {});
    };
    document.addEventListener("pointerdown", retry, { once: true });
  });
}

function stopMusic(): void {
  music?.pause();
}

/** Applies the persisted music toggle; call on board mount. */
export function syncMusic(): void {
  if (isMusicOn()) startMusic();
  else stopMusic();
}

export function toggleMusic(): boolean {
  const next = !isMusicOn();
  store(MUSIC_KEY, next);
  if (next) startMusic();
  else stopMusic();
  return next;
}

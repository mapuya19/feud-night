/** Original, reproducible synth loop. No samples or third-party composition.
 * Run: node scripts/generate-lobby-music.mjs
 * Source and generated WAV are covered by the repository MIT license.
 */
import { writeFileSync } from "node:fs";

const sampleRate = 22_050;
const seconds = 16;
const frames = sampleRate * seconds;
const wav = Buffer.alloc(44 + frames * 2);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); // PCM
wav.writeUInt16LE(1, 22); // mono
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(frames * 2, 40);

const chords = [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 53]];
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
const sine = (midi, time) => Math.sin(2 * Math.PI * frequency(midi) * time);
for (let i = 0; i < frames; i++) {
  const time = i / sampleRate;
  const chord = chords[Math.floor(time / 2) % chords.length];
  const chordTime = time % 2;
  const padEnvelope = Math.sin(Math.PI * chordTime / 2) ** 2;
  let signal = chord.reduce((sum, note) => sum + sine(note, chordTime), 0) * 0.035 * padEnvelope;
  const beat = Math.floor(time * 2);
  const noteTime = time % 0.5;
  const envelope = Math.sin(Math.PI * noteTime / 0.5) ** 2 * Math.exp(-6 * noteTime);
  signal += sine(chord[[0, 2, 1, 3][beat % 4]] + 12, noteTime) * 0.24 * envelope;
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, signal)) * 32767), 44 + i * 2);
}
writeFileSync(new URL("../public/sfx/lobby-loop.wav", import.meta.url), wav);
console.log(`Generated original ${seconds}s lobby loop (${wav.length} bytes)`);

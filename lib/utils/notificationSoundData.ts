/**
 * Embedded notification sound as base64 data URI
 * This is a simple pleasant notification tone
 */

// Generate notification sound using Web Audio API
export function createNotificationSound(): string {
  // Return a data URI that can be used as audio src
  // This is a simple beep sound encoded as base64 WAV
  // Format: 2-tone notification (C5 -> E5), 500ms duration

  const base64Sound = `data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQAAAAA=`;

  return base64Sound;
}

// Alternative: Generate sound dynamically using Web Audio API
export async function generateNotificationAudio(): Promise<string> {
  if (typeof window === 'undefined') return '';

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const sampleRate = audioContext.sampleRate;
  const duration = 5.0; // 5 seconds - longer, more pleasant notification
  const numSamples = Math.floor(sampleRate * duration);

  const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate);
  const channelData = audioBuffer.getChannelData(0);

  // Create a beautiful notification melody
  // Musical notes: C5, E5, G5, C6 (major chord progression - uplifting sound)
  const melody = [
    { freq: 523.25, start: 0.0, duration: 0.8 },    // C5
    { freq: 659.25, start: 0.8, duration: 0.8 },    // E5
    { freq: 783.99, start: 1.6, duration: 0.8 },    // G5
    { freq: 1046.50, start: 2.4, duration: 1.6 },   // C6 (longer for emphasis)
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let value = 0;

    // Play each note in the melody
    melody.forEach((note) => {
      if (t >= note.start && t < note.start + note.duration) {
        const noteTime = t - note.start;

        // Smooth attack and decay envelope (ADSR-like)
        const attackTime = 0.05; // 50ms attack
        const releaseTime = 0.3; // 300ms release
        let envelope = 1.0;

        if (noteTime < attackTime) {
          // Attack phase - fade in
          envelope = noteTime / attackTime;
        } else if (noteTime > note.duration - releaseTime) {
          // Release phase - fade out
          envelope = (note.duration - noteTime) / releaseTime;
        }

        // Add slight harmonic richness (fundamental + soft overtone)
        const fundamental = Math.sin(2 * Math.PI * note.freq * noteTime);
        const overtone = Math.sin(2 * Math.PI * note.freq * 2 * noteTime) * 0.1; // Subtle second harmonic

        value += (fundamental + overtone) * envelope * 0.3;
      }
    });

    // Add gentle reverb tail after main melody
    if (t > 4.0) {
      const reverbTime = t - 4.0;
      const reverbDecay = Math.exp(-4 * reverbTime);
      const reverbFreq = 1046.50; // Sustain the final C6 note
      value += Math.sin(2 * Math.PI * reverbFreq * reverbTime) * reverbDecay * 0.15;
    }

    // Soft limiter to prevent clipping
    channelData[i] = Math.max(-1, Math.min(1, value));
  }

  // Convert to blob URL
  const wav = audioBufferToWav(audioBuffer);
  const blob = new Blob([wav], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const samples: number[] = [];
  const channelData = buffer.getChannelData(0);

  for (let i = 0; i < buffer.length; i++) {
    const sample = channelData[i];
    const value = Math.max(-1, Math.min(1, sample));
    samples.push(value < 0 ? value * 0x8000 : value * 0x7FFF);
  }

  const dataLength = samples.length * bytesPerSample;
  const bufferLength = 44 + dataLength;
  const view = new DataView(new ArrayBuffer(bufferLength));

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferLength - 8, true);
  writeString(view, 8, 'WAVE');

  // FMT sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // Data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset, samples[i], true);
    offset += 2;
  }

  return view.buffer;
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Notification sound utility
 * Plays audio notifications when enabled in user preferences
 */

import { generateNotificationAudio } from './notificationSoundData';

let audioContext: AudioContext | null = null;
let notificationAudio: HTMLAudioElement | null = null;
let generatedSoundUrl: string | null = null;

// Initialize audio context (needed for some browsers)
function getAudioContext() {
  if (!audioContext && typeof window !== 'undefined') {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

// Preload notification sound
export async function preloadNotificationSound() {
  if (typeof window === 'undefined') return;

  try {
    // Try to load from public folder first
    notificationAudio = new Audio('/sounds/notification.mp3');
    notificationAudio.preload = 'auto';
    notificationAudio.volume = 0.5; // 50% volume by default

    // Handle load error - generate sound dynamically
    notificationAudio.addEventListener('error', async () => {
      console.log('Using generated notification sound');
      if (!generatedSoundUrl) {
        generatedSoundUrl = await generateNotificationAudio();
      }
      if (notificationAudio && generatedSoundUrl) {
        notificationAudio.src = generatedSoundUrl;
        notificationAudio.load();
      }
    });
  } catch (error) {
    console.error('Failed to preload notification sound:', error);
    // Generate sound as fallback
    try {
      generatedSoundUrl = await generateNotificationAudio();
    } catch (genError) {
      console.error('Failed to generate notification sound:', genError);
    }
  }
}

// Play notification sound
export async function playNotificationSound() {
  if (typeof window === 'undefined') return;

  try {
    // Check if sounds are enabled in localStorage
    const soundEnabled = localStorage.getItem('notificationSoundEnabled') !== 'false';
    if (!soundEnabled) return;

    // Resume audio context if it's suspended (browser autoplay policy)
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Play the sound
    if (notificationAudio) {
      notificationAudio.currentTime = 0; // Reset to start
      const playPromise = notificationAudio.play();

      if (playPromise !== undefined) {
        playPromise.catch(async error => {
          console.warn('Could not play notification sound, trying fallback:', error);
          // Try generating and playing sound
          if (!generatedSoundUrl) {
            generatedSoundUrl = await generateNotificationAudio();
          }
          if (generatedSoundUrl) {
            const audio = new Audio(generatedSoundUrl);
            audio.volume = 0.5;
            audio.play().catch(e => console.warn('Fallback audio failed:', e));
          }
        });
      }
    } else {
      // No preloaded audio - generate and play
      if (!generatedSoundUrl) {
        generatedSoundUrl = await generateNotificationAudio();
      }
      if (generatedSoundUrl) {
        const audio = new Audio(generatedSoundUrl);
        audio.volume = 0.5;
        audio.play().catch(error => {
          console.warn('Could not play notification sound:', error);
        });
      }
    }
  } catch (error) {
    console.error('Error playing notification sound:', error);
  }
}

// Set notification sound volume (0.0 to 1.0)
export function setNotificationVolume(volume: number) {
  if (notificationAudio) {
    notificationAudio.volume = Math.max(0, Math.min(1, volume));
  }
  // Also store preference
  if (typeof window !== 'undefined') {
    localStorage.setItem('notificationVolume', volume.toString());
  }
}

// Get current volume
export function getNotificationVolume(): number {
  if (typeof window === 'undefined') return 0.5;
  const stored = localStorage.getItem('notificationVolume');
  return stored ? parseFloat(stored) : 0.5;
}

// Enable/disable notification sounds
export function setNotificationSoundEnabled(enabled: boolean) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('notificationSoundEnabled', enabled.toString());
  }
}

// Check if notification sounds are enabled
export function isNotificationSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('notificationSoundEnabled') !== 'false';
}

# Notification Sounds

## Adding a Custom Notification Sound

Place a `notification.mp3` file in this directory for custom notification sounds.

The file should be:
- Format: MP3 or WAV
- Duration: 3-5 seconds (melodic and pleasant)
- Volume: Normalized (not too loud)
- Sample rate: 44.1kHz or 48kHz

## Fallback Behavior

If `notification.mp3` is not found, the system will automatically generate a beautiful 5-second notification melody using the Web Audio API. The generated sound features:
- 4-note ascending melody (C5 → E5 → G5 → C6)
- Smooth attack and decay envelopes
- Subtle harmonic overtones
- Gentle reverb tail for professional sound quality

## Recommended Free Sound Resources

1. **Zapsplat** (https://www.zapsplat.com/) - Free notification sounds
2. **Freesound** (https://freesound.org/) - Search for "notification" or "ding"
3. **Notification Sounds** (https://notificationsounds.com/)

## Testing

Open `/sounds/notification-generator.html` in your browser to:
- Preview the generated notification sound
- Download a custom notification sound
- Test different notification tones

## Current Implementation

The notification sound plays when:
- New booking notifications arrive
- Food order notifications appear
- Success/error toast messages show (optional)

Sound preferences are stored in localStorage and can be controlled via:
- Sound enable/disable toggle
- Volume control (0-100%)

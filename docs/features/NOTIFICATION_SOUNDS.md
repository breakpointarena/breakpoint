# Notification Sounds Implementation

## Overview
Notification sounds have been added to the admin dashboard to alert staff of important events like new bookings, food orders, and system notifications.

## Features

### 1. **Automatic Sound Generation**
- If no custom sound file is provided, the system automatically generates a pleasant two-tone notification sound using Web Audio API
- No external dependencies required - works out of the box
- Fallback system ensures sounds always work

### 2. **Sound Settings Control**
- **Location**: TopBar (next to notification bell)
- **Controls**:
  - Enable/Disable toggle
  - Volume slider (0-100%)
  - Test sound button
- Settings are stored in browser localStorage and persist across sessions

### 3. **When Sounds Play**
Notification sounds automatically play for:
- ✅ New booking notifications
- ✅ Food order notifications
- ✅ Real-time booking updates
- ✅ System notifications

### 4. **Custom Sound Support**
You can add a custom notification sound:
1. Place `notification.mp3` file in `/public/sounds/` directory
2. System will automatically use it instead of generated sound
3. Recommended specs:
   - Duration: 0.3-0.5 seconds
   - Format: MP3 or WAV
   - Sample rate: 44.1kHz
   - Normalized volume

## Files Added/Modified

### New Files:
1. `/lib/utils/notificationSound.ts` - Main sound utility functions
2. `/lib/utils/notificationSoundData.ts` - Dynamic sound generation
3. `/lib/utils/toast.ts` - Toast wrapper with sound support
4. `/components/admin/layout/SoundSettings.tsx` - Settings UI
5. `/components/ui/slider.tsx` - Volume slider component
6. `/public/sounds/README.md` - Sound directory documentation
7. `/public/sounds/notification-generator.html` - Tool to create custom sounds

### Modified Files:
1. `/components/admin/layout/NotificationToast.tsx` - Added sound playback
2. `/components/admin/layout/TopBar.tsx` - Added SoundSettings component

## Usage

### For Users:
1. Click the volume icon in the top bar
2. Toggle sounds on/off as needed
3. Adjust volume to preference
4. Use "Test Sound" to preview

### For Developers:

```typescript
// Import sound utilities
import { 
  playNotificationSound,
  preloadNotificationSound,
  setNotificationVolume,
  setNotificationSoundEnabled,
  isNotificationSoundEnabled 
} from '@/lib/utils/notificationSound';

// Play a notification sound
playNotificationSound();

// Preload sound (call once on app mount)
preloadNotificationSound();

// Set volume (0.0 to 1.0)
setNotificationVolume(0.5);

// Enable/disable sounds
setNotificationSoundEnabled(true);

// Check if enabled
if (isNotificationSoundEnabled()) {
  // ...
}
```

### Using Toast with Sound:

```typescript
// Import custom toast wrapper
import { toast } from '@/lib/utils/toast';

// These automatically play sound
toast.success('Operation successful');
toast.error('An error occurred');
toast.warning('Warning message');

// Silent toast without sound
toast.silent.success('Silent success');
```

## Browser Compatibility

- ✅ Chrome/Edge (full support)
- ✅ Firefox (full support)
- ✅ Safari (requires user interaction first due to autoplay policy)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

**Note**: Due to browser autoplay policies, the first sound may require user interaction (click, tap) to work. Subsequent sounds will play automatically.

## Testing

1. **Test Generated Sound**:
   - Open `/sounds/notification-generator.html`
   - Click "Preview Sound"
   - Adjust parameters as needed

2. **Test in Dashboard**:
   - Open admin dashboard
   - Click volume icon → Test Sound
   - Trigger a real notification (new booking)

3. **Test Settings Persistence**:
   - Change volume/toggle
   - Refresh page
   - Verify settings are remembered

## Troubleshooting

### Sound Not Playing?
1. Check if sound is enabled in settings (volume icon)
2. Check browser console for errors
3. Verify browser allows autoplay (may need user interaction first)
4. Check system volume is not muted

### Sound Too Loud/Quiet?
- Adjust volume slider in sound settings
- For custom sounds: normalize audio file before adding

### Want Different Sound?
- Replace `/public/sounds/notification.mp3` with your preferred sound
- Or use the generator tool to create a custom tone

## Performance

- Sounds are preloaded on page load (< 50KB)
- Generated sounds add minimal overhead
- No network requests after initial load
- localStorage keeps settings in sync

## Future Enhancements

Possible improvements:
- [ ] Multiple sound themes
- [ ] Different sounds for different notification types
- [ ] Sound preview in settings
- [ ] Import custom sounds via UI
- [ ] Per-notification-type volume control

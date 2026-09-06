'use client';

import { useState, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  playNotificationSound,
  getNotificationVolume,
  setNotificationVolume,
} from '@/lib/utils/notificationSound';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

export function SoundSettings() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [volume, setVolume] = useState(50);

  useEffect(() => {
    setSoundEnabled(isNotificationSoundEnabled());
    setVolume(Math.round(getNotificationVolume() * 100));
  }, []);

  const handleToggleSound = (enabled: boolean) => {
    setSoundEnabled(enabled);
    setNotificationSoundEnabled(enabled);

    // Play test sound when enabling
    if (enabled) {
      playNotificationSound();
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    setNotificationVolume(newVolume / 100);
  };

  const handleTestSound = () => {
    playNotificationSound();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-2 hover:text-white transition-colors duration-300 relative"
          aria-label="Sound settings"
        >
          {soundEnabled ? (
            <Volume2 className="h-5 w-5" />
          ) : (
            <VolumeX className="h-5 w-5" />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-72 bg-[var(--background)] border-[#27272a] p-4"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase text-white">
              Sound Settings
            </h3>
          </div>

          {/* Enable/Disable Sounds */}
          <div className="flex items-center justify-between">
            <Label htmlFor="sound-toggle" className="text-sm text-secondary-content">
              Notification Sounds
            </Label>
            <Switch
              id="sound-toggle"
              checked={soundEnabled}
              onCheckedChange={handleToggleSound}
            />
          </div>

          {/* Volume Control */}
          {soundEnabled && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-secondary-content">
                    Volume
                  </Label>
                  <span className="text-xs text-primary font-bold">
                    {volume}%
                  </span>
                </div>
                <Slider
                  value={[volume]}
                  onValueChange={handleVolumeChange}
                  max={100}
                  min={0}
                  step={5}
                  className="w-full"
                />
              </div>

              {/* Test Sound Button */}
              <button
                onClick={handleTestSound}
                className="w-full px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold uppercase rounded-lg transition-colors"
              >
                Test Sound
              </button>
            </>
          )}

          <p className="text-xs text-muted-content pt-2 border-t border-[#27272a]">
            Sounds play for new bookings, food orders, and notifications
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Loader2 } from "lucide-react"
import { StationCard } from '@/components/customer/home/device/StationCard'
import { getDevices } from './action';
import { SkeletonGrid } from '@/components/shared/SkeletonCard';

export interface Station {
  id: number
  device_type_id: string
  name: string
  station_num: string
  regular_hourly_rate: number
  included_players: number
  max_players: number
  extra_player_charge: number
  isAvailable: boolean
  availability: string
  description: string
  image: string
  available_count?: number
  total_count?: number
}

/**
 * Customer-facing wording for a station's state.
 *
 * "Booked" covered all three not-available cases before, which told someone
 * standing in the arena the wrong thing twice over: a table under maintenance
 * is not booked, and one being played on right now is worth saying plainly.
 */
function describeAvailability(status: string): string {
  switch (status) {
    case 'occupied':
      return 'In Use';
    case 'maintenance':
      return 'Under Maintenance';
    case 'inactive':
      return 'Unavailable';
    default:
      return 'Available';
  }
}

/**
 * Seeded by the landing page, which reads the stations on the server so the
 * grid arrives in the markup instead of after a round trip that could not even
 * begin until the bundle had hydrated.
 *
 * Optional because this file is also a route of its own (/home/device). Opened
 * directly there are no props, and it fetches for itself exactly as it did
 * before.
 */
interface DevicePageProps {
  initialDevices?: any[];
}

export default function DevicePage({ initialDevices }: DevicePageProps = {}) {
  const [devicesArray, setDevicesArray] = useState<any[]>(initialDevices ?? []);
  // Nothing is loading when the server already sent the answer.
  const [isLoadingData, setIsLoadingData] = useState(!initialDevices);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const sectionRef = React.useRef<HTMLElement>(null);

  const fetchFreshDevices = async () => {
    setIsLoadingData(true);
    try {
      const data = await getDevices();
      setDevicesArray(data || []);
    } catch (err) {
      console.error("Failed loading devices:", err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    // Already seeded from the server - re-reading it here would be exactly the
    // round trip this page was changed to avoid.
    if (initialDevices) return;
    fetchFreshDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The background clip: two seconds of it, and not a byte before it is seen.
   *
   * It plays a moment and freezes, so it is really an animated still - which is
   * why it was safe to stop the browser preloading it. `preload="none"` means
   * nothing is requested until `load()`, and that only happens once this
   * section is near the viewport.
   *
   * `play()` is allowed without a gesture because the element is muted; if a
   * browser refuses anyway the catch leaves a still first frame, which is what
   * this is for in the first place.
   */
  useEffect(() => {
    const video = videoRef.current;
    const target = sectionRef.current;
    // Both guards up here: bailing out after the listener below was attached
    // would leave it attached with no cleanup to remove it.
    if (!video || !target) return;

    const handleTimeUpdate = () => {
      if (video.currentTime >= 2) {
        video.pause();
      }
    };
    video.addEventListener('timeupdate', handleTimeUpdate);

    /**
     * The section is what gets watched, not the video.
     *
     * On desktop the CSS above pins the video with `position: fixed`, so its
     * own rect is always the viewport - observing it would report "visible"
     * immediately and load the file at once, which is the behaviour this is
     * meant to remove. The section is in normal flow and is the honest
     * question: has the reader reached this part of the page.
     *
     * The negative bottom margin pulls the root's lower edge up, so the
     * section has to be genuinely scrolled into rather than merely touching
     * the fold - it begins directly under a full-height hero, so a zero or
     * positive margin would match at the top of the page and defer nothing.
     * Expressed in pixels rather than a threshold so it does not depend on
     * how tall the section happens to be.
     */
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        video.load();
        video.play().catch(() => {
          /* A still frame is an acceptable outcome; see above. */
        });
      },
      { rootMargin: '0px 0px -200px 0px' }
    );
    observer.observe(target);

    return () => {
      observer.disconnect();
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, []);

  return (
    <section ref={sectionRef} id="features" className="relative min-h-screen py-24 overflow-hidden">
      <style jsx>{`
        @media (min-width: 769px) {
          .video-container video {
            position: fixed !important;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
          }
        }
      `}</style>

      {/* BG video — PS5 hero with parallax effect on desktop */}
      <div className="video-container absolute inset-0" style={{ zIndex: 0 }}>
        {/*
          * No `autoPlay` and `preload="none"`: this section sits below the fold,
          * and the browser was fetching 3.9MB of video for it before the customer
          * had seen anything at all. The effect below starts it when it actually
          * scrolls into view - it still plays, and still freezes after two
          * seconds, exactly as before.
          *
          * `poster` is deliberately absent: public/ps5_hero_poster.jpg is a
          * zero-byte file, so the attribute only bought a request that resolved
          * to a broken image. Drop a real frame in and put it back.
          */}
        <video
          ref={videoRef}
          muted
          playsInline
          preload="none"
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src="/ps5_hero.mp4" type="video/mp4" />
        </video>
      </div>

      {/* Gradient overlay - same as food section */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, #1E1F22 0%, rgba(30,31,34,0.88) 50%, #1E1F22 100%)',
          zIndex: 1
        }}
      />

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4" style={{ position: 'relative', zIndex: 10 }}>

        {/* Header */}
        <div className="text-left mb-16 flex flex-col items-start">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative inline-block"
          >
            <div className="absolute -top-8 left-0 w-24 h-24 bg-orange-600/15 blur-3xl rounded-full" />
            <h2
              className="relative text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-white via-gray-200 to-gray-500 tracking-wide uppercase"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Select Your Device
            </h2>
          </motion.div>
        </div>

        {/* Data */}
        <div className="mt-2">
          {isLoadingData ? (
            <SkeletonGrid count={8} className="grid-cols-1 min-[581px]:grid-cols-2 min-[787px]:grid-cols-3 min-[932px]:grid-cols-4" />
          ) : devicesArray.length === 0 ? (
            <div className="text-center py-24 bg-[#121212]/50 border border-[#27272a]/50 rounded-2xl text-[#a1a1aa] backdrop-blur-sm">
              No stations are currently available.
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 min-[581px]:grid-cols-2 min-[787px]:grid-cols-3 min-[932px]:grid-cols-4">
              {/*
                * One card per device type, not per physical unit - three PS5s
                * used to render as three identical cards, each claiming to be
                * "Available 3/3". Grouped here so the count badge on a single
                * card says what it means: how many of that type are free.
                */}
              {Object.values(
                devicesArray.reduce((groups: Record<string, any[]>, device) => {
                  const typeId = device.device_type?.id || device.device_type_id || 'unknown';
                  (groups[typeId] ||= []).push(device);
                  return groups;
                }, {})
              ).map((sameTypeDevices: any[], index) => {
                const totalCount = sameTypeDevices.length;
                const availableCount = sameTypeDevices.filter(d => d.effective_status === 'available').length;
                // Prefer a free unit's photo/specs for the card; falls back to
                // whichever unit is first when every station of this type is busy.
                const device = sameTypeDevices.find(d => d.effective_status === 'available') || sameTypeDevices[0];

                const stationData: Station = {
                  id: device.device_type?.id || device.device_type_id || device.id,
                  device_type_id: device.device_type?.id || '',
                  name: device.device_type?.display_name || 'Unknown Station',
                  station_num: device.station_number,
                  regular_hourly_rate: device.device_type?.regular_hourly_rate || 0,
                  included_players: device.device_type?.included_players || 1,
                  max_players: device.device_type?.max_players || 1,
                  extra_player_charge: device.device_type?.extra_player_charge || 0,
                  isAvailable: availableCount > 0,
                  availability: describeAvailability(availableCount > 0 ? 'available' : device.effective_status),
                  description: device.specs || device.device_type?.description || '',
                  image: device.image_url || "",
                  available_count: availableCount,
                  total_count: totalCount
                };

                return (
                  <StationCard
                    key={stationData.id}
                    station={stationData}
                    motionProps={{
                      initial: { opacity: 0, x: 50 },
                      whileInView: { opacity: 1, x: 0 },
                      viewport: { once: true, margin: '-50px' },
                      transition: { duration: 0.5, delay: index * 0.15 },
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
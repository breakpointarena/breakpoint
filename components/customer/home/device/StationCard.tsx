import React, { useState } from 'react';
import { Station } from '@/app/(customer)/home/device/page'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation';
import { useAppDispatch } from '@/lib/redux/hooks';
import { setDeviceType, setPricing, resetBooking } from '@/lib/redux/slices/bookingSlice';
import { Loader2 } from 'lucide-react';

export function StationCard({ station, motionProps }: { station: Station; motionProps: object }) {
    const avail = station.isAvailable
    const [isLoading, setIsLoading] = useState(false)

    const router = useRouter()
    const dispatch = useAppDispatch()
    const handleClick = () => {
        setIsLoading(true);
        dispatch(resetBooking());

        const hourlyRate = Number(station.regular_hourly_rate) || 0;

        dispatch(setDeviceType({
            id: station.device_type_id,
            name: station.name,
            hourlyRate: hourlyRate,
            includedPlayers: station.included_players,
            maxPlayers: station.max_players,
            extraPlayerCharge: Number(station.extra_player_charge)
        }));

        dispatch(setPricing({
            subtotal: hourlyRate,
            subscriptionDiscount: 0,
            promoDiscount: 0,
            total: hourlyRate
        }));

        router.push('/booking/slots-v2')
    }

    return (
        // Outer wrapper: holds the hover border OUTSIDE overflow-hidden so it's never clipped
        <motion.div
            {...motionProps}
            className="group relative rounded-xl aspect-[4/3] min-[581px]:aspect-[3/4] cursor-pointer
        border-2 border-transparent
        hover:border-primary
        hover:shadow-[0_0_24px_rgba(255,193,7,0.5)]
        transition-[border-color,box-shadow] duration-300"
        >
            <div className="relative w-full h-full rounded-xl overflow-hidden bg-gradient-to-br from-zinc-900/95 via-zinc-950/95 to-black/95 backdrop-blur-md border border-zinc-800/60">
                {/* Station Cover Image */}
                {station.image && (
                    <img
                        src={station.image}
                        alt={station.name}
                        className="absolute inset-0 w-full h-full object-cover opacity-45 group-hover:scale-110 transition-transform duration-500 pointer-events-none"
                    />
                )}

                {/* Darker gradient overlay for better contrast */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-all duration-400 group-hover:from-black/95 group-hover:via-black/60 pointer-events-none" />

                {/* Availability Badge */}
                <div
                    className={`absolute top-3 right-3.5 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] min-[581px]:text-[11px] font-bold tracking-widest uppercase transition-transform duration-400 group-hover:-translate-y-1 ${avail
                        ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/60'
                        : 'bg-red-500/30 text-red-300 border border-red-400/60'
                        }`}
                >
                    <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${avail ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}
                    />
                    Available {station.available_count ?? 0}/{station.total_count ?? 0}
                </div>



                {/* Bottom Info - Updated with mobile translation offset */}
                <div className="absolute bottom-0 left-0 right-0 z-10 px-3.5 pb-3.5 pt-5 min-[581px]:px-4 min-[581px]:pb-4 min-[581px]:pt-6 transition-transform duration-400 ease-[cubic-bezier(.25,1,.5,1)] -translate-y-14 min-[581px]:translate-y-0 group-hover:-translate-y-14">
                    {/* Device Name */}
                    <h3
                        className={`font-black uppercase tracking-wide leading-tight mb-1.5 text-base min-[581px]:text-lg ${avail ? 'text-primary' : 'text-white/70'}`}
                        style={{ fontFamily: "'Rajdhani', sans-serif" }}
                    >
                        {station.name}
                    </h3>

                    {/* Price  */}
                    <div className="flex items-baseline gap-1.5 mb-2 min-[581px]:mb-3">
                        <span
                            className="text-white font-black text-xl min-[581px]:text-2xl leading-none"
                            style={{ fontFamily: "'Rajdhani', sans-serif" }}
                        >
                            ₹{station.regular_hourly_rate}
                        </span>
                        <span className="text-white/65 text-[11px] font-semibold uppercase tracking-widest">
                            / hr
                        </span>
                    </div>

                    {/* Meta Pills */}
                    <div className="flex flex-wrap gap-1 min-[581px]:gap-1.5 mb-2 min-[581px]:mb-3">
                        <span className="bg-zinc-800/60 border border-zinc-700/60 rounded-full text-xs min-[581px]:text-[12px] text-zinc-300 px-2 min-[581px]:px-2.5 py-0.5 min-[581px]:py-1 font-medium tracking-wide">
                            Incl. <span className="text-white font-semibold">{station.included_players}</span>{' '}
                            players
                        </span>
                        <span className="bg-zinc-800/60 border border-zinc-700/60 rounded-full text-xs min-[581px]:text-[12px] text-zinc-300 px-2 min-[581px]:px-2.5 py-0.5 min-[581px]:py-1 font-medium tracking-wide">
                            Max <span className="text-white font-semibold">{station.max_players}</span>
                        </span>
                        {station.extra_player_charge > 0 ? (
                            <span className="bg-zinc-800/60 border border-zinc-700/60 rounded-full text-xs min-[581px]:text-[12px] text-zinc-300 px-2 min-[581px]:px-2.5 py-0.5 min-[581px]:py-1 font-medium tracking-wide">
                                +<span className="text-white font-semibold">₹{station.extra_player_charge}</span>
                                /extra
                            </span>
                        ) : (
                            <span className="bg-zinc-800/60 border border-zinc-700/60 rounded-full text-xs min-[581px]:text-[12px] text-zinc-300 px-2 min-[581px]:px-2.5 py-0.5 min-[581px]:py-1 font-medium tracking-wide">
                                <span className="text-white font-semibold">No</span> extra charge
                            </span>
                        )}
                    </div>

                    {/* Description */}
                    <p className="hidden min-[581px]:block text-zinc-400 text-[13px] leading-relaxed line-clamp-2">
                        {station.description}
                    </p>
                </div>

                {/* Book Station Button - Updated to be visible on mobile by default */}
                <div className="absolute bottom-3.5 min-[581px]:bottom-4 left-3.5 min-[581px]:left-4 right-3.5 min-[581px]:right-4 z-20 opacity-100 translate-y-0 min-[581px]:opacity-0 min-[581px]:translate-y-5 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-400 ease-[cubic-bezier(.25,1,.5,1)]">
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            handleClick()
                        }}
                        disabled={!avail || isLoading}
                        className={`w-full py-2.5 min-[581px]:py-3 rounded-xl font-black text-[12px] min-[581px]:text-[13px] tracking-widest uppercase transition-colors duration-200 flex items-center justify-center gap-2 ${avail
                            ? 'bg-gradient-primary text-[var(--button-text)] hover:bg-gradient-primary-hover active:scale-95'
                            : 'bg-white/6 text-white/25 border border-white/10 cursor-not-allowed'
                            }`}
                        style={{ fontFamily: "'Rajdhani', sans-serif" }}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Loading...
                            </>
                        ) : (
                            avail ? 'Book slot' : 'Fully Booked'
                        )}
                    </button>
                </div>
            </div>
        </motion.div>
    )
}


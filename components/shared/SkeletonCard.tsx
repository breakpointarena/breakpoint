'use client'

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-zinc-900/50 border border-zinc-800 ${className}`}>
      <div className="aspect-square bg-zinc-800/50 rounded-t-xl" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-zinc-800/50 rounded w-3/4" />
        <div className="h-3 bg-zinc-800/50 rounded w-1/2" />
      </div>
    </div>
  )
}

export function SkeletonGrid({ count = 8, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

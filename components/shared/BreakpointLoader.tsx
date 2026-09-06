"use client";

import { motion } from "framer-motion";

interface BreakpointLoaderProps {
  size?: "sm" | "md" | "lg" | "xl";
  text?: string;
}

const sizeMap = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-16 h-16",
  xl: "w-24 h-24"
};

const textSizeMap = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg"
};

export function BreakpointLoader({ size = "md", text }: BreakpointLoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <motion.div
        animate={{
          rotate: 360,
          scale: [1, 1.15, 1],
        }}
        transition={{
          rotate: { repeat: Infinity, duration: 1.5, ease: "linear" },
          scale: { repeat: Infinity, duration: 1.5, ease: "easeInOut" }
        }}
        className="flex-shrink-0"
      >
        <img
          src="/bp_logo.png"
          alt="Loading..."
          className={`${sizeMap[size]} object-contain rounded-md`}
        />
      </motion.div>
      {text && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`${textSizeMap[size]} font-black uppercase tracking-wide text-white`}
        >
          {text}
        </motion.p>
      )}
    </div>
  );
}

export function BreakpointLoaderFullScreen({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0a14]/95 backdrop-blur-sm">
      <BreakpointLoader size="xl" text={text} />
    </div>
  );
}

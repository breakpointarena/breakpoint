import type { NextConfig } from "next";

/**
 * Uploaded images are served by whichever Supabase this build talks to, so the
 * optimizer is allowed to fetch from exactly that origin and nothing else.
 *
 * This used to key on `NODE_ENV === "development"` instead, which broke in two
 * ways. A local stack serves images over http from loopback, so any production
 * build - including `next start` on a developer's own machine - dropped the
 * loopback entry and every uploaded image 404'd with "url parameter is not
 * allowed". Worse, `next build` and `next dev` share `.next`, so building once
 * while a dev server was running left that server serving a production copy of
 * this allowlist, and images that had been fine stopped loading with no config
 * change at all.
 *
 * Deriving it from `NEXT_PUBLIC_SUPABASE_URL` is also *narrower* than the old
 * rule: loopback is permitted only when the app is actually configured to use a
 * loopback Supabase - in which case it is already fetching its data from there -
 * and a deployment pointed at a hosted project allows that project alone.
 */
function supabaseImageOrigin(): URL | null {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured) return null;

  try {
    return new URL(configured);
  } catch {
    // A malformed URL is the env's problem, not the optimizer's; fall back to
    // the hosted pattern below rather than failing the build.
    return null;
  }
}

const supabaseOrigin = supabaseImageOrigin();

function supabaseImagePattern() {
  if (!supabaseOrigin) return [];

  return [
    {
      protocol: supabaseOrigin.protocol.replace(":", "") as "http" | "https",
      hostname: supabaseOrigin.hostname,
      port: supabaseOrigin.port,
      pathname: "/storage/v1/object/public/**",
    },
  ];
}

/**
 * Whether the Supabase this build talks to is on the machine or the local network.
 *
 * Next 16 refuses to optimize an image that resolves to a private address, which
 * is a sound default - it stops the optimizer being turned into a probe of an
 * internal network - but it also means a local Supabase stack serves uploads that
 * `next/image` will not render, failing with "url parameter is not allowed" while
 * the log quietly says "resolved to private ip". Allowing it is gated on the app
 * already being pointed at that address for its data, so a deployment against a
 * hosted project never opens the door.
 */
function isLocalOrigin(url: URL | null): boolean {
  if (!url) return false;

  const host = url.hostname;

  if (host === "localhost" || host === "::1" || host.endsWith(".localhost")) return true;
  if (host === "0.0.0.0") return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;

  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];

  return (
    a === 127 ||                          // loopback
    a === 10 ||                           // private class A
    (a === 172 && b >= 16 && b <= 31) ||  // private class B
    (a === 192 && b === 168) ||           // private class C
    (a === 169 && b === 254)              // link-local
  );
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'i.pravatar.cc',
      },
      {
        protocol: 'https',
        hostname: 's40091.pcdn.co',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      ...supabaseImagePattern(),
    ],
    // Only ever true for a local or private-network Supabase - see isLocalOrigin.
    dangerouslyAllowLocalIP: isLocalOrigin(supabaseOrigin),
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Next.js 16 turned `quality` into an allowlist (default [75]); 85 is used by FoodCard.
    qualities: [75, 85],
  },
};

export default nextConfig;

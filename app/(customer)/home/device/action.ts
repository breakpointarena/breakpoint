"use server"

import { fetchStations } from "@/lib/home/stations"

/**
 * The browser's way in to the station list.
 *
 * The query itself lives in `lib/home/stations.ts` so that the landing page,
 * which is a Server Component, can call it during its own render - Next will
 * not run a Server Function there. This wrapper is what the standalone
 * /home/device route still calls from a `useEffect`, over the network.
 */
export async function getDevices() {
  return fetchStations()
}

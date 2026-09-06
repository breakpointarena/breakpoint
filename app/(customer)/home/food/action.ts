"use server"

import { fetchMenu } from "@/lib/home/menu"

/**
 * The browser's way in to the customer menu.
 *
 * See `getDevices` in ../device/action.ts - the query lives in `lib/home/menu.ts`
 * so the landing page can await it while rendering on the server, and this
 * wrapper stays for the standalone /home/food route, which fetches it from the
 * client.
 */
export async function getMenuItems() {
  return fetchMenu()
}

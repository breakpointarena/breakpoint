import { redirect } from "next/navigation";

export default function WalkInDeviceRedirectPage() {
  redirect("/admin/bookings?new=walk-in&kind=device");
}

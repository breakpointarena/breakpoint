import { redirect } from "next/navigation";

export default function WalkInRedirectPage() {
  redirect("/admin/bookings?new=walk-in");
}

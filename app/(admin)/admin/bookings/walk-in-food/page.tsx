import { redirect } from "next/navigation";

export default function WalkInFoodRedirectPage() {
  redirect("/admin/bookings?new=walk-in&kind=food");
}

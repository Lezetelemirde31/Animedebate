import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";

export default async function MyProfilePage() {
  const user = await requireUser("/profile");
  redirect(`/profile/${user.username}`);
}

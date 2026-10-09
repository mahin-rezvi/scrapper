"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export default function AdminSignOut() {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.replace("/auth/sign-in");
    router.refresh();
  }

  return <button className="button button-outline" type="button" onClick={signOut}>Sign out</button>;
}

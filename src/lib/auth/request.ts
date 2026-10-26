import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "../server/gateway";

export const SESSION_COOKIE = "accountbook-session";
export const currentUser = cache(async () => (await auth("me")).user);

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

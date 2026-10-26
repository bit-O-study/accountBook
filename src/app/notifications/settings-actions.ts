"use server";
import { revalidatePath } from "next/cache";
import { command } from "@/lib/server/gateway";
export async function saveNotificationSettings(data: Record<string, string>) {
  const result = await command("notificationSettingsAction", data);
  revalidatePath("/notifications");
  return result;
}

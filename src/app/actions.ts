"use server";

import { revalidatePath } from "next/cache";
import { command } from "@/lib/server/gateway";
import type { FormState } from "@/lib/application/commands";
export type { FormState } from "@/lib/application/commands";

export async function syncNowAction() {
  const result = await command("syncNowAction", {});
  revalidatePath("/", "layout");
  return result;
}

export async function syncIfStaleAction() {
  const result = await command("syncIfStaleAction", {});
  if (result) revalidatePath("/", "layout");
  return result;
}

export async function addTransactionAction(_: FormState, f: FormData) {
  const result = await command("addTransactionAction", Object.fromEntries([...f.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string")));
  revalidatePath("/", "layout");
  return result;
}

export async function updateTransactionAction(_: FormState, f: FormData) {
  const result = await command("updateTransactionAction", Object.fromEntries([...f.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string")));
  revalidatePath("/", "layout");
  return result;
}

export async function deleteTransactionAction(id: string) {
  const result = await command("deleteTransactionAction", { value: id });
  revalidatePath("/", "layout");
  return result;
}

export async function makeRecurringFromTxAction(id: string) {
  const result = await command("makeRecurringFromTxAction", { value: id });
  revalidatePath("/", "layout");
  return result;
}

export async function saveRecurringAction(_: FormState, f: FormData) {
  const result = await command("saveRecurringAction", Object.fromEntries([...f.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string")));
  revalidatePath("/", "layout");
  return result;
}

export async function togglePauseRecurringAction(id: string) {
  const result = await command("togglePauseRecurringAction", { value: id });
  revalidatePath("/", "layout");
  return result;
}

export async function deleteRecurringAction(id: string) {
  const result = await command("deleteRecurringAction", { value: id });
  revalidatePath("/", "layout");
  return result;
}

export async function acceptSuggestionAction(merchantNorm: string) {
  const result = await command("acceptSuggestionAction", { value: merchantNorm });
  revalidatePath("/", "layout");
  return result;
}

export async function dismissSuggestionAction(merchantNorm: string) {
  const result = await command("dismissSuggestionAction", { value: merchantNorm });
  revalidatePath("/", "layout");
  return result;
}

export async function setBudgetAction(_: FormState, f: FormData) {
  const result = await command("setBudgetAction", Object.fromEntries([...f.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string")));
  revalidatePath("/", "layout");
  return result;
}

export async function connectAccountAction(_: FormState, f: FormData) {
  const result = await command("connectAccountAction", Object.fromEntries([...f.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string")));
  revalidatePath("/", "layout");
  return result;
}

export async function reconnectAccountAction(id: string) {
  const result = await command("reconnectAccountAction", { value: id });
  revalidatePath("/", "layout");
  return result;
}

export async function syncAccountAction(id: string) {
  const result = await command("syncAccountAction", { value: id });
  revalidatePath("/", "layout");
  return result;
}

export async function disconnectAccountAction(_: FormState, f: FormData) {
  const result = await command("disconnectAccountAction", Object.fromEntries([...f.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string")));
  revalidatePath("/", "layout");
  return result;
}

export async function importCsvAction(_: FormState, f: FormData) {
  const result = await command("importCsvAction", Object.fromEntries([...f.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string")));
  revalidatePath("/", "layout");
  return result;
}

export async function markAllReadAction() {
  const result = await command("markAllReadAction", {});
  revalidatePath("/", "layout");
  return result;
}

export async function saveInstallmentAction(_: FormState, f: FormData) {
  const result = await command("saveInstallmentAction", Object.fromEntries([...f.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string")));
  revalidatePath("/", "layout");
  return result;
}

export async function linkRefundAction(_: FormState, f: FormData) {
  const result = await command("linkRefundAction", Object.fromEntries([...f.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string")));
  revalidatePath("/", "layout");
  return result;
}
export async function unlinkRefundAction(id: string) {
  const result = await command("unlinkRefundAction", { value: id });
  revalidatePath("/", "layout");
  return result;
}

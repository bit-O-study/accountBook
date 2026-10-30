"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, SESSION_COOKIE } from "@/lib/server/gateway";
import { ApiError } from "@/lib/server/transport";

export interface AuthState { error?: string }
const fields = (form: FormData) => Object.fromEntries([...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string" && !entry[0].startsWith("$ACTION_")));

async function start(operation: "login" | "signup", form: FormData): Promise<AuthState> {
  try {
    const result = await auth(operation, fields(form));
    if (!result.session) throw new Error("Missing session");
    (await cookies()).set(SESSION_COOKIE, result.session.token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: result.session.expiresAt,
    });
    revalidatePath("/", "layout");
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  redirect("/");
}
export async function loginAction(_: AuthState, form: FormData): Promise<AuthState> { return start("login", form); }
export async function signupAction(_: AuthState, form: FormData): Promise<AuthState> { return start("signup", form); }
export async function logoutAction() {
  await auth("logout");
  (await cookies()).delete(SESSION_COOKIE);
  revalidatePath("/", "layout");
  redirect("/login");
}

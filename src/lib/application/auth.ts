import { allowAuthAttempt, authenticate, AuthError, createSession, findSessionUser, registerUser, revokeSession } from "../auth/service";
import { normalizeEmail, validEmail } from "../auth/credentials";
import { fields, InputError } from "./contract";

export type PublicUser = { id: string; name: string; email: string | null };
export type AuthResult = { user: PublicUser | null; session?: { token: string; expiresAt: Date } };
export type AuthOperation = "me" | "login" | "signup" | "logout";

export async function runAuth(operation: AuthOperation, input: unknown, token?: string): Promise<AuthResult> {
  const data = fields(input);
  if (operation === "me") return { user: await findSessionUser(token) };
  if (operation === "logout") { await revokeSession(token); return { user: null }; }
  if (operation !== "login" && operation !== "signup") throw new InputError("지원하지 않는 인증 작업이에요.");
  if (Object.keys(data).some(key => !["email", "password", "confirmPassword", "name", "claimCode"].includes(key)))
    throw new InputError("입력 항목을 확인해 주세요.");
  const email = normalizeEmail(data.email ?? "");
  if (!validEmail(email)) throw new AuthError("이메일 주소를 확인해 주세요.");
  if (!(await allowAuthAttempt(email))) throw new AuthError("요청이 많아요. 15분 뒤 다시 시도해 주세요.");
  if (operation === "signup" && data.password !== data.confirmPassword) throw new AuthError("두 비밀번호가 같지 않아요.");
  const user = operation === "login" ? await authenticate(email, data.password ?? "")
    : await registerUser({ email, name: data.name ?? "", password: data.password ?? "", claimCode: data.claimCode });
  await revokeSession(token);
  return { user, session: await createSession(user.id) };
}

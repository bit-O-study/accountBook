import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/request";
import { AuthForm } from "@/components/auth/AuthForm";

export default async function SignupPage() {
  if (await currentUser()) redirect("/");
  return <AuthForm mode="signup" />;
}

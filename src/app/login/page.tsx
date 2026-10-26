import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/request";
import { AuthForm } from "@/components/auth/AuthForm";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return <AuthForm mode="login" />;
}

import { logoutAction } from "@/app/auth/actions";
import { SubmitButton } from "@/components/buttons";
import styles from "./auth.module.css";

export function AccountMenu({ name }: { name: string }) {
  return <div className={styles.toolbar}>
    <span className={styles.name}>{name}님의 가계부</span>
    <form action={logoutAction}><SubmitButton className="btn sm" pending="로그아웃 중…">로그아웃</SubmitButton></form>
  </div>;
}

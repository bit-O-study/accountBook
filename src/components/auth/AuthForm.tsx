"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type AuthState } from "@/app/auth/actions";
import { SubmitButton } from "@/components/buttons";
import styles from "./auth.module.css";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const signup = mode === "signup";
  const [state, action] = useActionState<AuthState, FormData>(signup ? signupAction : loginAction, {});
  return (
    <main className={styles.screen}>
      <section className={`card ${styles.card}`}>
        <p className={styles.brand}>₩ 가계부</p>
        <h1 className={styles.title}>{signup ? "내 가계부 시작하기" : "다시 만나서 반가워요"}</h1>
        <p className={styles.intro}>{signup ? "수입과 지출을 나만의 공간에서 관리해요." : "로그인하고 내 가계부를 이어서 확인하세요."}</p>
        <form action={action} className={styles.form}>
          {signup && <label className="label" htmlFor="auth-name">이름<input id="auth-name" name="name" className="field" autoComplete="name" maxLength={50} required /></label>}
          <label className="label" htmlFor="auth-email">이메일<input id="auth-email" name="email" type="email" className="field" autoComplete="username" maxLength={254} required /></label>
          <label className="label" htmlFor="auth-password">비밀번호
            <input id="auth-password" name="password" type="password" className="field" autoComplete={signup ? "new-password" : "current-password"} minLength={15} maxLength={128} required aria-describedby={signup ? "password-hint" : undefined} />
            {signup && <span id="password-hint" className={styles.hint}>15~128자. 기억하기 쉬운 긴 문장도 좋아요.</span>}
          </label>
          {signup && <>
            <label className="label" htmlFor="auth-confirm">비밀번호 확인<input id="auth-confirm" name="confirmPassword" type="password" className="field" autoComplete="new-password" minLength={15} maxLength={128} required /></label>
            <details className={styles.claim}>
              <summary>기존 가계부 연결</summary>
              <label className="label" htmlFor="auth-claim">연결 코드 (선택)<input id="auth-claim" name="claimCode" className="field" autoComplete="off" maxLength={64} spellCheck={false} /><span className={styles.hint}>발급받은 코드가 있으면 입력해 주세요. 없으면 새 가계부를 만들어요.</span></label>
            </details>
          </>}
          {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
          <SubmitButton pending={signup ? "가입 중…" : "로그인 중…"}>{signup ? "가입하고 시작하기" : "로그인"}</SubmitButton>
        </form>
        <p className={styles.footer}>{signup ? "이미 계정이 있나요? " : "처음 사용하시나요? "}<Link href={signup ? "/login" : "/signup"}>{signup ? "로그인" : "회원가입"}</Link></p>
      </section>
    </main>
  );
}

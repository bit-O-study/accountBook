"use client";

import styles from "./dashboard.module.css";

export default function ErrorPage() {
  return (
    <div className="page">
      <section className={`card empty ${styles.error}`} role="alert">
        <h1 style={{ fontSize: 20 }}>가계부를 불러오지 못했어요</h1>
        <p>잠시 후 다시 시도해 주세요. 계속 문제가 생기면 서버 연결을 확인해 주세요.</p>
        <button type="button" className="btn pri" onClick={() => window.location.reload()}>다시 시도</button>
      </section>
    </div>
  );
}

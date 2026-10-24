"use client";

import "./globals.css";

export default function GlobalError() {
  return (
    <html lang="ko">
      <body>
        <main className="main">
          <section className="card empty" role="alert">
            <h1 style={{ fontSize: 20 }}>가계부에 연결하지 못했어요</h1>
            <p>서버 연결을 확인한 뒤 다시 시도해 주세요.</p>
            <button type="button" className="btn pri" onClick={() => window.location.reload()}>다시 시도</button>
          </section>
        </main>
      </body>
    </html>
  );
}

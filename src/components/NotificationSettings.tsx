"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveNotificationSettings } from "@/app/notifications/settings-actions";
import type { loadNotificationSettings } from "@/lib/notifications/service";

type Settings = Awaited<ReturnType<typeof loadNotificationSettings>>;
const labels: Record<string, string> = { READY: "발송 대기", SENDING: "발송 중", SENT: "전송 완료", FAILED: "발송 실패", UNKNOWN: "전송 여부 확인 필요", CANCELED: "취소" };
export function NotificationSettings({ settings }: { settings: Settings }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [supported, setSupported] = useState(false);
  const router = useRouter();
  useEffect(() => { setSupported("serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext); }, []);
  function save(data: Record<string, string>) {
    start(async () => {
      try { const result = await saveNotificationSettings(data); setMessage(result.message); router.refresh(); }
      catch { setMessage("알림 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요."); }
    });
  }
  function enablePush() {
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") { setMessage("브라우저 설정에서 알림을 허용한 뒤 다시 눌러 주세요."); return; }
        await navigator.serviceWorker.register("/notification-sw.js");
        const registration = await navigator.serviceWorker.ready;
        const key = settings.capabilities.publicKey.replace(/-/g, "+").replace(/_/g, "/");
        const applicationServerKey = Uint8Array.from(atob(key), char => char.charCodeAt(0));
        const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        const result = await saveNotificationSettings({ operation: "subscribe", subscription: JSON.stringify(subscription.toJSON()) });
        setMessage(result.message); router.refresh();
      } catch { setMessage("브라우저 알림을 연결하지 못했어요. 권한과 연결 상태를 확인해 주세요."); }
    });
  }
  return <section className="card pad" style={{ marginBottom: 16 }} aria-labelledby="notification-settings-title">
    <h2 id="notification-settings-title">알림 받는 방법</h2>
    <p className="muted">새 알림을 한국시간 오전 8시·오후 1시·오후 7시에 모아서 보내요. 밤 10시부터 오전 8시까지는 보내지 않아요.</p>
    <p className="faint" style={{ fontSize: 13 }}>켜기 전 알림과 읽은 알림은 보내지 않아요. 외부 메시지에는 금액이나 거래처 대신 새 알림 건수만 표시해요.</p>
    <div style={{ marginTop: 16 }}>
      <h3>이메일</h3>
      <p>{settings.email || "로그인 이메일이 없어요."} · {settings.emailEnabled ? "수신 중" : "꺼짐"}</p>
      {!settings.capabilities.email && <p className="muted">이메일 발송은 아직 준비 중이에요. 앱 안 알림은 계속 확인할 수 있어요.</p>}
      {settings.emailEnabled ? <button className="btn sm" disabled={pending} onClick={() => save({ operation: "emailOff" })}>이메일 알림 끄기</button>
        : <button className="btn sm" disabled={pending || !settings.capabilities.email || !settings.email} onClick={() => save({ operation: "emailRequest" })}>이메일 확인 코드 받기</button>}
      {settings.codePending && <form onSubmit={event => { event.preventDefault(); save({ operation: "emailVerify", code }); }} style={{ marginTop: 12 }}>
        <label className="label" htmlFor="notification-code">확인 코드</label>
        <input id="notification-code" className="field" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value)} style={{ maxWidth: 180, marginRight: 8 }} />
        <button className="btn pri sm" disabled={pending}>확인하고 이메일 알림 켜기</button>
      </form>}
    </div>
    <div style={{ marginTop: 24 }}>
      <h3>브라우저 푸시</h3>
      {!settings.capabilities.push && <p className="muted">푸시 발송은 아직 준비 중이에요.</p>}
      {!supported && <p className="muted">푸시를 지원하는 브라우저의 보안 연결에서 이용할 수 있어요.</p>}
      <button className="btn sm" disabled={pending || !supported || !settings.capabilities.push} onClick={enablePush}>이 브라우저에서 알림 받기</button>
      {settings.subscriptions.map((sub, index) => <div key={sub.id} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 10 }}>
        <span>브라우저 {index + 1} · {new Date(sub.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} 등록</span>
        <button className="btn ghost sm" disabled={pending} onClick={() => save({ operation: "unsubscribe", id: sub.id })}>브라우저 {index + 1} 알림 해제</button>
      </div>)}
    </div>
    <p role="status" className="form-msg" style={{ marginTop: 12 }}>{pending ? "처리 중이에요…" : message}</p>
    {settings.recent.length > 0 && <details style={{ marginTop: 12 }}><summary>최근 발송 상태</summary>
      {settings.recent.map(item => <p key={item.id} className="muted">{item.channel === "EMAIL" ? "이메일" : "푸시"} · {labels[item.status] || item.status}</p>)}
      <p className="faint">전송 완료는 발송 서비스의 접수를 뜻해요. 도착이나 읽음을 보장하지는 않아요. 전송 여부가 불확실하면 자동으로 다시 보내지 않아요.</p>
    </details>}
  </section>;
}

import Link from "next/link";
import { markAllReadAction } from "@/app/actions";
import { ActionButton } from "@/components/buttons";
import { Icon, type IconName } from "@/components/Icon";
import { getUser, prisma } from "@/lib/db";
import { kstDateStr, kstTimeStr, shortDate, todayStr } from "@/lib/dates";

const TYPE: Record<string, { icon: IconName; link: string }> = {
  DUE: { icon: "calendar", link: "고정지출 보기" },
  CHANGED: { icon: "alert", link: "고정지출 보기" },
  MISSING: { icon: "alert", link: "고정지출 보기" },
  SUGGEST: { icon: "sparkle", link: "등록하러 가기" },
  SYNC_FAIL: { icon: "link", link: "다시 연결하기" },
  BUDGET: { icon: "wallet", link: "예산 보기" },
};

function when(d: Date, today: string): string {
  const day = kstDateStr(d);
  return day === today ? `오늘 ${kstTimeStr(d)}` : `${shortDate(day)} ${kstTimeStr(d)}`;
}

export default async function NotificationsPage() {
  const user = await getUser();
  const today = todayStr();
  const list = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = list.filter((n) => !n.readAt).length;

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <h1>알림</h1>
        {unread > 0 && <span className="badge bad" style={{ marginLeft: 0 }}>{unread}</span>}
        <span className="grow" />
        {unread > 0 && (
          <ActionButton action={markAllReadAction} className="btn sm" pending="처리 중…">
            모두 읽음
          </ActionButton>
        )}
      </div>

      <section className="card pad">
        {list.length === 0 ? (
          <div className="empty">
            <Icon name="bell" />
            <b>아직 알림이 없어요</b>
            결제 예정, 금액 변동, 납부 미확인, 새 고정지출, 연동 끊김을 여기서 알려드려요.
          </div>
        ) : (
          <div>
            {list.map((n) => {
              const t = TYPE[n.type] ?? { icon: "bell" as IconName, link: "보기" };
              return (
                <article key={n.id} className={`noti ${n.readAt ? "" : "unread"}`}>
                  <span className={`ic ${n.type}`} aria-hidden="true">
                    <Icon name={t.icon} />
                  </span>
                  <b>
                    {n.title}
                    {!n.readAt && <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}> (안 읽음)</span>}
                  </b>
                  <time dateTime={n.createdAt.toISOString()}>{when(n.createdAt, today)}</time>
                  <p>
                    {n.body}
                    {n.href && (
                      <>
                        {" "}
                        <Link href={n.href}>{t.link}</Link>
                      </>
                    )}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <p className="faint" style={{ fontSize: 12.5 }}>지금은 앱 안에서만 알려드려요. 휴대폰 푸시와 이메일 알림은 다음 단계에서 추가돼요.</p>
    </div>
  );
}

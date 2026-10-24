import styles from "./dashboard.module.css";

export default function Loading() {
  return (
    <div className="page" role="status" aria-live="polite" aria-busy="true">
      <p className="muted">가계부를 불러오는 중이에요.</p>
      <div className="kpis" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="card kpi" key={index}>
            <div className={styles.placeholder} />
            <div className={styles.placeholder} style={{ width: "90%", height: 32, margin: "8px 0" }} />
            <div className={styles.placeholder} />
          </div>
        ))}
      </div>
      <div className="grid-2" aria-hidden="true">
        {[0, 1].map((index) => (
          <div className="card pad" key={index}>
            <div className={styles.placeholder} />
            <div className={styles.block} />
          </div>
        ))}
      </div>
    </div>
  );
}

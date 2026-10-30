/** 같은 키의 진행 중 작업 결과를 공유한다. 작업을 시작하기 전에 Map에 등록한다. */
export function shareInFlight<T>(pending: Map<string, Promise<T>>, key: string, run: () => Promise<T>): Promise<T> {
  const current = pending.get(key);
  if (current) return current;
  const task = Promise.resolve().then(run).finally(() => {
    if (pending.get(key) === task) pending.delete(key);
  });
  pending.set(key, task);
  return task;
}

/** 변경 후처리는 생략하지 않고 순서대로 실행한다. 앞 작업 실패가 다음 작업을 막지 않는다. */
export function enqueue<T>(tails: Map<string, Promise<unknown>>, key: string, run: () => Promise<T>): Promise<T> {
  const task = (tails.get(key) ?? Promise.resolve()).catch(() => undefined).then(run).finally(() => {
    if (tails.get(key) === task) tails.delete(key);
  });
  tails.set(key, task);
  return task;
}

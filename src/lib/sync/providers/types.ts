// 금융 데이터 연동사 어댑터 인터페이스.
// 실제 연동사(CODEF 등)는 이 인터페이스를 구현해 providers/index.ts 에 등록한다.

export type ProviderTxType = "APPROVAL" | "CANCEL" | "PARTIAL_CANCEL" | "DEPOSIT" | "WITHDRAWAL";

export interface ProviderTx {
  externalId: string;
  type: ProviderTxType;
  occurredAt: Date;
  amount: number; // 지출 음수, 수입 양수. CANCEL/PARTIAL_CANCEL 은 취소 금액(양수)
  merchantRaw: string;
  mcc?: string;
  originalExternalId?: string; // 취소 대상
}

export interface ProviderAccount {
  id: string;
  name: string;
  kind: "CARD" | "BANK";
  providerConfig: string;
  tokenEnc: string | null;
  createdAt: Date;
}

export class ProviderAuthError extends Error {
  constructor(message = "인증이 만료되었어요. 다시 연결해 주세요.") {
    super(message);
    this.name = "ProviderAuthError";
  }
}

export interface FinanceProvider {
  key: string;
  label: string;
  /** since 이후 거래를 가져온다. 인증 실패는 ProviderAuthError 로 알린다. */
  fetchTransactions(account: ProviderAccount, since: Date, until: Date): Promise<ProviderTx[]>;
}

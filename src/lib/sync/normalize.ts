// STEP 2 · 정리: 카드사마다 다른 가맹점 표기를 같은 이름으로 맞춘다.
// 정규화된 이름(merchantNorm)은 중복 제거, 자동 분류, 고정지출 대조의 기준 키다.

interface Brand {
  pattern: RegExp;
  name: string;
  category: string;
}

const BRANDS: Brand[] = [
  { pattern: /우아한형제들|배달의\s*민족|배민/i, name: "배달의민족", category: "식비" },
  { pattern: /쿠팡이츠/i, name: "쿠팡이츠", category: "식비" },
  { pattern: /쿠팡|coupang/i, name: "쿠팡", category: "쇼핑" },
  { pattern: /스타벅스|starbucks/i, name: "스타벅스", category: "카페" },
  { pattern: /투썸/i, name: "투썸플레이스", category: "카페" },
  { pattern: /메가\s*(mgc)?\s*커피/i, name: "메가커피", category: "카페" },
  { pattern: /넷플릭스|netflix/i, name: "넷플릭스", category: "구독" },
  { pattern: /youtube|유튜브/i, name: "유튜브 프리미엄", category: "구독" },
  { pattern: /spotify|스포티파이/i, name: "스포티파이", category: "구독" },
  { pattern: /sk\s*텔레콤|skt/i, name: "SKT", category: "통신" },
  { pattern: /kt\s*통신|^kt\b/i, name: "KT", category: "통신" },
  { pattern: /lg\s*u\+|엘지유플러스/i, name: "LG U+", category: "통신" },
  { pattern: /카카오\s*t|카카오모빌리티/i, name: "카카오T", category: "교통" },
  { pattern: /티머니|교통카드|지하철|버스/i, name: "대중교통", category: "교통" },
  { pattern: /이마트|emart/i, name: "이마트", category: "식비" },
  { pattern: /홈플러스/i, name: "홈플러스", category: "식비" },
  { pattern: /gs25/i, name: "GS25", category: "식비" },
  { pattern: /^cu\b|씨유/i, name: "CU", category: "식비" },
  { pattern: /올리브영/i, name: "올리브영", category: "쇼핑" },
  { pattern: /cgv/i, name: "CGV", category: "문화" },
  { pattern: /에이블짐/i, name: "에이블짐", category: "건강" },
  { pattern: /손해보험|생명보험|화재/i, name: "", category: "보험" },
];

const CORP_MARKERS = /\(주\)|㈜|주식회사|\(유\)|유한회사/g;

export interface NormalizedMerchant {
  norm: string;
  brandCategory?: string;
}

export function normalizeMerchant(raw: string): NormalizedMerchant {
  const cleaned = raw.replace(CORP_MARKERS, " ").replace(/\s+/g, " ").trim();
  for (const b of BRANDS) {
    if (b.pattern.test(cleaned)) {
      return { norm: b.name || cleaned, brandCategory: b.category };
    }
  }
  return { norm: cleaned || "알 수 없음" };
}

/** 화면 표시용: 법인 표기만 지운 원래 이름 */
export function displayMerchant(raw: string): string {
  return raw.replace(CORP_MARKERS, " ").replace(/\s+/g, " ").trim();
}

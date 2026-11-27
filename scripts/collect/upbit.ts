// 업비트 시세 조회 REST API 요청 (data-spec 2.1). 키 없이 쓴다.
// Origin 헤더를 보내면 한도가 10초당 1회로 줄어들므로 보내지 않는다.

export const UPBIT_API = 'https://api.upbit.com/v1';
export const USER_AGENT = 'coin-sim-collector';

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<Response>;

export class UpbitHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'UpbitHttpError';
    this.status = status;
  }
}

const HEADERS = { Accept: 'application/json', 'User-Agent': USER_AGENT };

async function getJson(path: string, fetchFn: FetchLike): Promise<unknown> {
  const res = await fetchFn(`${UPBIT_API}${path}`, { headers: { ...HEADERS } });
  if (!res.ok) {
    // 응답 본문과 요청 헤더는 로그에 남기지 않는다 (conventions 9장)
    throw new UpbitHttpError(res.status, `${path.split('?')[0]} 요청 실패: HTTP ${res.status}`);
  }
  return res.json();
}

/** 전체 마켓 목록 (유의 종목 정보 포함). 형식 검사는 markets.ts가 한다. */
export function fetchMarketList(fetchFn: FetchLike = fetch): Promise<unknown> {
  return getJson('/market/all?is_details=true', fetchFn);
}

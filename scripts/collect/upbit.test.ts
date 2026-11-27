import { describe, expect, it } from 'vitest';
import { type FetchLike, fetchMarketList, UpbitHttpError, USER_AGENT } from './upbit';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fn: FetchLike = (url, init) => {
    calls.push({ url, headers: init.headers });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return { fn, calls };
}

describe('fetchMarketList', () => {
  it('상세 정보를 포함해 요청하고 JSON을 돌려준다', async () => {
    const { fn, calls } = fakeFetch(200, [{ market: 'KRW-AAA' }]);
    expect(await fetchMarketList(fn)).toEqual([{ market: 'KRW-AAA' }]);
    expect(calls[0]?.url).toBe('https://api.upbit.com/v1/market/all?is_details=true');
  });

  it('User-Agent를 보내고 Origin 헤더는 보내지 않는다', async () => {
    const { fn, calls } = fakeFetch(200, []);
    await fetchMarketList(fn);
    const headers = Object.fromEntries(
      Object.entries(calls[0]?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    expect(headers['user-agent']).toBe(USER_AGENT);
    expect(headers).not.toHaveProperty('origin');
  });

  it('실패 응답이면 상태 코드를 담은 예외', async () => {
    const { fn } = fakeFetch(429, { error: 'too many' });
    const error = await fetchMarketList(fn).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpbitHttpError);
    expect((error as UpbitHttpError).status).toBe(429);
    expect((error as UpbitHttpError).message).toBe('/market/all 요청 실패: HTTP 429');
  });
});

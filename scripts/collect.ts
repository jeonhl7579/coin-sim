// 업비트 원화 마켓 1시간 캔들 수집 → data/raw/ (data-spec 2장)
// 실행: npm run collect [-- --markets KRW-BTC,KRW-ETH] [--markets-only]
// 종료 코드: 0 = 성공, 1 = 실패

import { fileURLToPath } from 'node:url';
import { parseCliArgs } from './collect/cli';
import { collectMarket, type MarketResult } from './collect/collectMarket';
import {
  type MarketEntry,
  type MarketsFile,
  parseKrwMarkets,
  selectMarkets,
} from './collect/markets';
import { type CollectState, readState, writeJsonAtomic, writeState } from './collect/storage';
import { createUpbitClient, UpbitBlockedError, type UpbitClient } from './collect/upbit';

const RAW_DIR = fileURLToPath(new URL('../data/raw/', import.meta.url));
const MARKETS_FILE = `${RAW_DIR}markets.json`;
const STATE_FILE = `${RAW_DIR}state.json`;

/** 초 단위 UTC ISO 8601 (예: 2026-11-28T04:12:00Z) */
function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatResult(r: MarketResult): string {
  const parts = [
    `+${r.addedNew + r.addedOld} (새 ${r.addedNew}, 과거 ${r.addedOld})`,
    `총 ${r.total}개`,
    r.reachedStart ? '첫 캔들 도달' : '첫 캔들 미도달',
    `요청 ${r.pages}`,
  ];
  if (r.conflicts > 0) {
    parts.push(`값이 다른 중복 ${r.conflicts}개(기존 값 유지)`);
  }
  return parts.join(' · ');
}

/** 마켓을 차례로 받는다. 마켓 하나가 실패하면 건너뛰고, 418이면 전체를 멈춘다. */
async function collectCandles(markets: MarketEntry[], client: UpbitClient): Promise<number> {
  const state: CollectState = await readState(STATE_FILE);
  state.lastRun = {
    startedAt: nowIso(),
    finishedAt: null,
    status: 'running',
    requests: 0,
    failedMarkets: [],
  };
  await writeState(STATE_FILE, state);
  const run = state.lastRun;
  const deps = {
    fetchPage: (market: string, to?: string) => client.fetchCandles(market, to),
    now: () => Date.now(),
  };

  for (const [i, { market }] of markets.entries()) {
    const tag = `[collect] [${i + 1}/${markets.length}] ${market}`;
    try {
      const { result, state: marketState } = await collectMarket(
        market,
        state.markets[market],
        RAW_DIR,
        deps,
      );
      state.markets[market] = marketState;
      console.log(`${tag} ${formatResult(result)}`);
    } catch (error) {
      run.failedMarkets.push(market);
      console.error(`${tag} 실패: ${describe(error)}`);
      if (error instanceof UpbitBlockedError) {
        run.status = 'failed';
        run.finishedAt = nowIso();
        run.requests = client.requestCount();
        await writeState(STATE_FILE, state);
        console.error('[collect] 418 차단으로 멈춘다. 차단이 풀린 뒤 다시 실행하면 이어 받는다');
        return 1;
      }
    }
    run.requests = client.requestCount();
    await writeState(STATE_FILE, state);
  }

  run.status = run.failedMarkets.length > 0 ? 'partial' : 'ok';
  run.finishedAt = nowIso();
  run.requests = client.requestCount();
  await writeState(STATE_FILE, state);
  const failed = run.failedMarkets.length;
  console.log(
    `[collect] 끝: ${markets.length - failed}개 성공, ${failed}개 실패, 요청 ${run.requests}건 (${run.status})`,
  );
  return failed > 0 ? 1 : 0;
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseCliArgs(argv);
  if (!parsed.ok) {
    console.error(`[collect] 옵션 오류: ${parsed.reason}`);
    return 1;
  }
  const { options } = parsed;

  const client = createUpbitClient();
  const fetchedAt = nowIso();
  const all = parseKrwMarkets(await client.fetchMarketList());
  const file: MarketsFile = { fetchedAt, markets: all };
  await writeJsonAtomic(MARKETS_FILE, file);
  const warned = all.filter((m) => m.warning).length;
  console.log(
    `[collect] 원화 마켓 ${all.length}개 (유의 종목 ${warned}개) → data/raw/markets.json`,
  );

  const selected = selectMarkets(all, options.markets);
  if (!selected.ok) {
    console.error(`[collect] 지금 원화 마켓 목록에 없는 코드: ${selected.unknown.join(', ')}`);
    return 1;
  }
  console.log(`[collect] 수집 대상 ${selected.markets.length}개`);

  if (options.marketsOnly) {
    return 0;
  }
  return collectCandles(selected.markets, client);
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(`[collect] 실패: ${describe(error)}`);
  process.exitCode = 1;
}

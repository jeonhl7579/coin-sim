// 게임용 통계 JSON의 계약 (data-spec 4장 v1, D-31). 분석(analysis/export.py)이 만들고 엔진이 읽는다.
// 구조를 바꾸면 SCHEMA_VERSION을 올리고 data-spec 6장을 따른다. 불러오기와 버전 검사는 loadStats() (3번 작업).

export const SCHEMA_VERSION = 1;

/** 시장 상태 (data-spec 4.1) */
export type RegimeState = 'bull' | 'bear' | 'sideways';

/** 통계가 있는 성격. 폭락형(crash)은 구조가 달라 따로 둔다 */
export type Archetype = 'leader' | 'large' | 'mid' | 'small';

/** 정제에서 코인을 뺀 이유 (data-spec 3.1) */
export type ExcludeReason =
  'invalidFormat' | 'minPeriod' | 'pegged' | 'minQuoteVolume' | 'maxMissingRatio';

/** 분위수. p는 meta.quantileGrid와 같고, 엔진은 사이 값을 선형 보간해 뽑는다 */
export interface Quantiles {
  p: number[];
  v: number[];
}

export type ByState<T> = Record<RegimeState, T>;

/** 표준화한 36시간 조각의 배열. 엔진은 12~36시간 길이와 시작 위치를 무작위로 골라 쓴다 */
export type Segments = number[][];

export interface Shock {
  /** 1,000시간당 급등락 사건 수 (충격이 처음 발생할 코인의 상대 가중치) */
  relativeFrequency: number;
  upShare: number;
  /** 방향별 크기(절댓값) */
  up: Quantiles;
  down: Quantiles;
}

export interface ArchetypeStats {
  beta: Quantiles;
  volatility: ByState<Quantiles>;
  segments: ByState<Segments>;
  shock: Shock;
  /** 캔들 꼬리 길이 ÷ 1시간 변동성 */
  wick: ByState<Quantiles>;
}

export interface CrashStats {
  /** 600시간 누적 고유 수익률 */
  drawdown: Quantiles;
  /** 이후 300시간 누적 고유 수익률 (막판 반등) */
  recovery: Quantiles;
  volatility: Quantiles;
  segments: Segments;
}

export interface StatsMeta {
  source: string;
  /** 사용한 원본의 첫·마지막 캔들 시각 (UTC ISO 8601) */
  dataFrom: string;
  dataUntil: string;
  markets: { collected: number; used: number; excluded: Record<ExcludeReason, number> };
  archetypeCounts: Record<Archetype | 'crash', number>;
  quantileGrid: number[];
  /** 분석 기준값 (재현용). 엔진은 쓰지 않는다 */
  analysisParams: Record<string, unknown>;
}

/** 데이터로 구분된 값만 있다. 없는 키는 config의 [임시값]을 쓴다 (D-75) */
export interface Propagation {
  probability?: Partial<Record<Archetype, number>>;
  scope?: Quantiles;
  /** 시차 0·1·2·3시간 비율 */
  delay?: number[];
  strength?: Quantiles;
  opposite?: number;
}

export interface StatsFile {
  schemaVersion: number;
  meta: StatsMeta;
  regimes: {
    duration: ByState<Quantiles>;
    /** 상태가 끝났을 때 다른 상태로 간 비율 (자기 자신 제외) */
    switch: {
      bull: { bear: number; sideways: number };
      bear: { bull: number; sideways: number };
      sideways: { bull: number; bear: number };
    };
  };
  market: { volatility: ByState<number>; segments: ByState<Segments> };
  archetypes: Record<Archetype, ArchetypeStats> & { crash: CrashStats };
  marketShock: { ratePer1000h: number; upShare: number; up: Quantiles; down: Quantiles };
  propagation: Propagation;
  /** 실제 코인 이름·티커 해시 (data-spec 5장). normalize = 'nfkc-lower-alnum', hash = 'fnv1a32' */
  realNames: { normalize: string; hash: string; values: number[] };
}

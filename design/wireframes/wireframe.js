/* Coin Sim 와이어프레임 공통 스크립트
   반복되는 자리표시(차트, 코인 목록, 뉴스)를 채운다. 동작 구현이 아니라 그림용. */

const WF_COINS = [
  ["Arkon", "ARK", "48,210,000", 3.1, true],
  ["Bexa", "BXA", "3,512,000", -1.2, false],
  ["Coralis", "CRL", "812.4", 0.4, true],
  ["Dunemint", "DNM", "1,204", -4.8, false],
  ["Elvy", "ELV", "92.15", 12.6, false],
  ["Fyrr", "FYR", "5,830", -0.3, false],
  ["Gloom", "GLM", "0.0412", 27.9, false],
  ["Hoxa", "HXA", "312.8", -2.1, false],
  ["Ivory", "IVR", "18,440", 1.7, false],
  ["Jolt", "JLT", "2,840", -9.4, true],
];

function wfPct(p) {
  const cls = p >= 0 ? "up" : "down";
  const sign = p >= 0 ? "▲" : "▼";
  return `<span class="${cls}">${sign}${Math.abs(p).toFixed(1)}%</span>`;
}

/* 결정적 난수 (시안마다 같은 모양) */
function wfRand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* <div class="chart" data-candles="60" data-seed="3" data-volume> */
function wfDrawChart(el) {
  const n = +el.dataset.candles || 60;
  const rnd = wfRand(+el.dataset.seed || 1);
  const W = 1000, H = 400;
  const volH = "volume" in el.dataset ? 70 : 0;
  const cutAt = el.dataset.future ? Math.floor(n * +el.dataset.future) : n; // 준비 상태: 일부만 그림
  let price = 200, pts = [];
  for (let i = 0; i < n; i++) {
    const o = price;
    const c = o + (rnd() - 0.48) * 18;
    const h = Math.max(o, c) + rnd() * 8;
    const l = Math.min(o, c) - rnd() * 8;
    pts.push({ o, c, h, l, v: 10 + rnd() * 50 });
    price = c;
  }
  const max = Math.max(...pts.map(p => p.h)), min = Math.min(...pts.map(p => p.l));
  const y = v => 10 + (max - v) / (max - min) * (H - volH - 20);
  const cw = W / n;
  let svg = "";
  pts.slice(0, cutAt).forEach((p, i) => {
    const x = i * cw + cw / 2;
    const up = p.c >= p.o;
    const top = y(Math.max(p.o, p.c)), bot = y(Math.min(p.o, p.c));
    svg += `<line x1="${x}" x2="${x}" y1="${y(p.h)}" y2="${y(p.l)}" stroke="#777" stroke-width="1"/>`;
    svg += `<rect x="${x - cw * 0.32}" y="${top}" width="${cw * 0.64}" height="${Math.max(1, bot - top)}" fill="${up ? "#fff" : "#888"}" stroke="#666" stroke-width="1"/>`;
    if (volH) {
      const vh = p.v / 60 * (volH - 10);
      svg += `<rect x="${x - cw * 0.32}" y="${H - vh}" width="${cw * 0.64}" height="${vh}" fill="#d8d8d8"/>`;
    }
  });
  if (volH) svg += `<line x1="0" x2="${W}" y1="${H - volH}" y2="${H - volH}" stroke="#ccc" stroke-dasharray="4 4"/>`;
  if (cutAt < n) {
    const x = cutAt * cw;
    svg += `<line x1="${x}" x2="${x}" y1="0" y2="${H}" stroke="#222" stroke-width="2"/>`;
  }
  el.insertAdjacentHTML("afterbegin",
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${svg}</svg>`);
}

/* <table class="list js-coins" data-count="10" data-sel="0" data-cols="name,price,pct"> */
function wfCoinTable(el) {
  const count = +el.dataset.count || 10;
  const sel = el.dataset.sel === undefined ? 0 : +el.dataset.sel;
  const cols = (el.dataset.cols || "name,price,pct").split(",");
  const head = { name: "이름", price: "현재가", pct: "등락" , ticker: "티커"};
  let html = "<thead><tr>" + cols.map(c => `<th class="${c === "name" || c === "ticker" ? "" : "r"}">${head[c]}</th>`).join("") + "</tr></thead><tbody>";
  WF_COINS.slice(0, count).forEach(([name, tk, price, pct, held], i) => {
    html += `<tr class="${i === sel ? "sel" : ""}">` + cols.map(c => {
      if (c === "name") return `<td>${held ? '<span class="dot"></span>' : '<span style="display:inline-block;width:12px"></span>'}${tk} <span class="muted small">${name}</span></td>`;
      if (c === "ticker") return `<td>${held ? '<span class="dot"></span>' : ""}${tk}</td>`;
      if (c === "price") return `<td class="r mono">${price}</td>`;
      if (c === "pct") return `<td class="r mono">${wfPct(pct)}</td>`;
    }).join("") + "</tr>";
  });
  el.innerHTML = html + "</tbody>";
}

/* <div class="js-strip" data-count="10" data-sel="0"> 가로 티커 카드 */
function wfStrip(el) {
  const sel = +(el.dataset.sel || 0);
  el.innerHTML = WF_COINS.slice(0, +el.dataset.count || 10).map(([name, tk, price, pct, held], i) =>
    `<div class="box ${i === sel ? "fill" : ""}" style="flex:1;padding:4px 8px;${i === sel ? "border:1.5px solid #222" : ""}">
       <div class="row between small"><b>${held ? '<span class="dot"></span>' : ""}${tk}</b>${wfPct(pct)}</div>
       <div class="mono small muted">${price}</div>
     </div>`).join("");
}

const WF_NEWS = [
  ["D+3 14:00", "JLT", "Jolt 상장 거래소 해킹 의혹 제기"],
  ["D+3 13:40", "ARK", "Arkon 재단, 대형 파트너십 발표 예정"],
  ["D+3 11:20", "JLT", "Jolt 개발팀 지갑에서 대량 이동 포착"],
  ["D+3 09:05", "시장", "주요국 금리 동결 — 위험자산 관망세"],
  ["D+2 22:50", "GLM", "커뮤니티 밈 확산, 거래량 급증"],
  ["D+2 18:10", "BXA", "Bexa 메인넷 업데이트 일정 연기"],
];

/* <ul class="js-news" data-count="4" data-compact> */
function wfNews(el) {
  const compact = "compact" in el.dataset;
  el.style.listStyle = "none"; el.style.margin = 0; el.style.padding = 0;
  el.innerHTML = WF_NEWS.slice(0, +el.dataset.count || 5).map(([t, tag, title], i) =>
    `<li class="row" style="padding:${compact ? 2 : 4}px 0;border-bottom:1px solid #e3e3e3;font-size:12px">
       <span class="chip ${i === 0 ? "dark" : ""}">${tag}</span>
       <span class="grow" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</span>
       <span class="muted small mono">${t}</span>
     </li>`).join("");
}

/* 공통 주문 패널 마크업 (S-04 주문 패널 = S-04a 직접 주문에서 재사용) */
function wfOrderForm(tk, opts = {}) {
  const dis = opts.disabled ? " disabled" : " primary";
  return `
    <div class="seg" style="display:flex"><span class="btn${opts.sell ? "" : " primary"} grow">매수</span><span class="btn${opts.sell ? " primary" : ""} grow">매도</span></div>
    <div class="tabs"><span class="on">시장가</span><span>지정가</span></div>
    <div class="row"><span class="small muted" style="width:32px">가격</span><div class="input grow"><span>시장가</span><span>KRW</span></div></div>
    <div class="row"><span class="small muted" style="width:32px">수량</span><div class="input grow"><span>${opts.qty || "0"}</span><span>${tk}</span></div></div>
    <div class="row" style="gap:4px"><span class="btn sm grow">25%</span><span class="btn sm grow">50%</span><span class="btn sm grow">100%</span></div>
    <div class="small"><div class="row between"><span class="muted">주문 금액</span><span class="mono">${opts.amount || "0"}</span></div><div class="row between"><span class="muted">수수료 (0.05%)</span><span class="mono">${opts.fee || "0"}</span></div></div>
    ${opts.spacer ? '<span class="grow"></span>' : ""}
    <span class="btn block${dis}">${tk} ${opts.sell ? "매도" : "매수"}</span>`;
}

/* 시안 C 게임 화면을 배경으로 그린다 (S-04a, S-04b 공용)
   <div class="frame js-game-c" data-sel="9" data-paused="event|user" data-locked data-band="텍스트" data-band-flash>
   프레임 안에 HTML로 직접 적은 오버레이(.dim, .modal 등)는 이 배경 위에 그대로 남는다. */
function wfGameC(el) {
  const sel = +(el.dataset.sel || 0);
  const [name, tk, price, pct] = WF_COINS[sel];
  const paused = el.dataset.paused;
  const locked = "locked" in el.dataset;
  const band = el.dataset.band;
  const speed = paused === "event"
    ? '<span class="seg" style="margin-left:6px"><span class="btn sm disabled">1x</span><span class="btn sm disabled">2x</span><span class="btn sm disabled">3x</span></span>'
    : '<span class="seg" style="margin-left:6px"><span class="btn sm on">1x</span><span class="btn sm">2x</span><span class="btn sm">3x</span></span>';
  const pauseChip = paused === "event" ? '<span class="chip dark">⚠ 이벤트 일시정지</span>'
    : paused === "user" ? '<span class="chip">일시정지 — 주문 가능</span>' : "";
  const bandHtml = band ? `
    <div class="row between small" style="border:${"bandFlash" in el.dataset ? "2.5px" : "1.5px"} solid #222;background:${"bandFlash" in el.dataset ? "#d0d0d0" : "#ececec"};padding:4px 8px;margin-bottom:6px">
      <span>⚠ <b>이벤트 대기 중:</b> "${band}" <span class="muted">— 선택지를 골라야 재개됩니다</span></span><span class="btn sm">펼치기 ▴</span>
    </div>` : "";
  const html = `
    <div class="topbar">
      <span class="logo">COIN SIM</span><span class="sep"></span>
      <div class="col" style="gap:2px;width:300px">
        <div class="row between small"><b class="mono">D+3 14:00</b><span class="muted mono">75 / 600 캔들</span></div>
        <div class="progress"><i style="width:12.5%"></i></div>
      </div>
      <span class="sep"></span>
      <div class="row" style="gap:4px">
        <span class="btn sm ${paused ? "on" : ""}">⏸</span><span class="btn sm ${paused ? "" : "on"}">▶</span>${speed}
      </div>
      ${pauseChip}
      <span class="grow"></span>
      <div style="text-align:right"><div class="small muted">총자산</div><div class="b mono">9,871,000 <span class="down">▼1.3%</span></div></div>
      <span class="btn ghost">그만두기</span>
    </div>
    <div class="row js-strip" data-sel="${sel}" style="padding:8px 8px 0;gap:6px;flex:none"></div>
    <div class="grow" style="display:grid;grid-template-columns:1fr 300px;grid-template-rows:1fr 200px;gap:8px;padding:8px;position:relative">
      <div class="box col" style="grid-column:1;grid-row:1">
        ${bandHtml}
        <div class="row between">
          <div class="row" style="gap:10px"><b style="font-size:16px">${name}</b><span class="chip">${tk}</span><b class="mono" style="font-size:16px">${price}</b>${wfPct(pct)}</div>
          <div class="seg"><span class="btn sm on">1시간</span><span class="btn sm">4시간</span><span class="btn sm">1일</span></div>
        </div>
        <div class="chart grow" data-candles="80" data-seed="${sel + 11}" data-volume></div>
      </div>
      <div class="box col" style="gap:6px;grid-column:2;grid-row:1">
        ${wfOrderForm(tk, { spacer: true, disabled: locked })}
        ${locked ? '<div class="lock"><span>🔒 이벤트 창에서만 주문할 수 있습니다</span></div>' : ""}
      </div>
      <div style="grid-column:1/3;grid-row:2;display:grid;grid-template-columns:1.3fr 0.8fr 1.2fr;gap:8px;min-height:0">
        <div class="box col">
          <div class="t"><span>보유 현황</span><span class="mono">현금 5,412,000 · 묶인 현금 0</span></div>
          <table class="list">
            <thead><tr><th>코인</th><th class="r">수량</th><th class="r">평균가</th><th class="r">평가금액</th><th class="r">손익</th></tr></thead>
            <tbody>
              <tr><td>ARK</td><td class="r mono">0.10</td><td class="r mono">46,900,000</td><td class="r mono">4,821,000</td><td class="r mono up">▲2.8%</td></tr>
              <tr><td>CRL</td><td class="r mono">1,200</td><td class="r mono">830.1</td><td class="r mono">974,880</td><td class="r mono down">▼2.1%</td></tr>
              <tr><td>JLT</td><td class="r mono">1,200</td><td class="r mono">3,120</td><td class="r mono">3,408,000</td><td class="r mono down">▼9.0%</td></tr>
            </tbody>
          </table>
        </div>
        <div class="box col">
          <div class="t"><span>대기 중인 지정가 (1)</span></div>
          <div class="row between small"><span><span class="chip">매도</span> ARK 0.05<br><span class="muted mono">@ 50,100,000</span></span><span class="btn sm ghost">취소</span></div>
        </div>
        <div class="box col">
          <div class="t"><span>뉴스 피드</span></div>
          <ul class="js-news" data-count="5" data-compact></ul>
        </div>
      </div>
    </div>`;
  el.insertAdjacentHTML("afterbegin", html);
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".js-game-c").forEach(wfGameC);
  document.querySelectorAll(".chart[data-candles]").forEach(wfDrawChart);
  document.querySelectorAll(".js-coins").forEach(wfCoinTable);
  document.querySelectorAll(".js-strip").forEach(wfStrip);
  document.querySelectorAll(".js-news").forEach(wfNews);
});

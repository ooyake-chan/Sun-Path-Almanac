/**
 * main.js
 * エントリポイント。フォントロード完了を待ってからリングを描画する。
 */
import { renderRing, renderCurrentMomentSun } from './renderer.js';

const LAT = 35.44;
const LON = 139.45;

/** 現在JST時刻の年（西暦） */
function getCurrentJstYear() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  return jst.getUTCFullYear();
}

async function init() {
  // カスタムフォントの読み込み完了を待つ（FOUT を抑える）
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (_) {
      /* ignore */
    }
  }

  const year = getCurrentJstYear();
  document.getElementById('year').textContent = year;
  document.getElementById('coords').textContent =
    `${LAT}°N  ${LON}°E`;

  const svg = document.getElementById('ring-svg');
  renderRing(svg, year, LAT, LON);

  // スマホ拡大用
  const [sx, sy] = renderCurrentMomentSun(svg, year, LAT);
  if (window.innerWidth <= 768) {
    const zoom = 15;  // 小さいほど拡大
    const zoomedViewBox = `${sx - zoom/2} ${sy - zoom/3} ${zoom} ${zoom}`;
    const fullViewBox = '-18 -10 38 38';  // index.html の初期値と合わせる
    let isZoomed = true;

    svg.setAttribute('viewBox', zoomedViewBox);

    // タップで切り替え
    svg.addEventListener('click', () => {
    isZoomed = !isZoomed;
    svg.setAttribute('viewBox', isZoomed ? zoomedViewBox : fullViewBox);
  });
}

  updateDateTime();
  setInterval(updateDateTime, 1_000);
  setInterval(() => {
    renderCurrentMomentSun(svg, year, LAT);
}, 15_000);

  // オープニング演出
  playIntro(svg);

  // スクロール連動パララックス（PCのみ）
  setupParallax();

  // モバイル縦スクロール（スマホのみ）
  setupMobileScroll();
}

function updateDateTime() {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const month = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  const h = String(jst.getUTCHours()).padStart(2, '0');
  const m = String(jst.getUTCMinutes()).padStart(2, '0');
  const s = String(jst.getUTCSeconds()).padStart(2, '0');
  document.getElementById('current-date').textContent = `${month}/${day}`;
  document.getElementById('current-time').textContent = `${h}:${m}:${s}`;
}

// ============================
// オープニング演出
// ============================
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3); // 速→遅
const easeInCubic  = (t) => t * t * t;              // 遅→速

/** requestAnimationFrame ベースの簡易トゥイーン。
 *  onUpdate には 0→1 にイージング済みの進捗が渡る。 */
function tween({ duration, easing, onUpdate, onDone = null, delay = 0 }) {
  const startAt = performance.now() + delay;
  function frame(now) {
    if (now < startAt) { requestAnimationFrame(frame); return; }
    const t = Math.min(1, (now - startAt) / duration);
    onUpdate(easing(t));
    if (t < 1) requestAnimationFrame(frame);
    else if (onDone) onDone();
  }
  requestAnimationFrame(frame);
}

/**
 * ページを開いた時の 3〜4秒の導入アニメーション。
 *  1) 太陽フェードイン（0→1, 1.4s, 速→遅）
 *  2) リングのクロックワイプ（1.0s 時点で開始・1.0s・遅→速、12時起点で時計回り）
 *  3) リング完成の約3秒後にスクロール誘導をフェードイン
 * prefers-reduced-motion 時はアニメせず即時表示。
 */
function playIntro(svg) {
  const sun = svg.querySelector('#sun-marker');
  const wipe = svg.querySelector('#wipe-circle');
  const hint = document.getElementById('scroll-hint');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // フォールバック：アニメ無しで即時に最終状態へ
  if (reduce || !sun || !wipe) {
    if (sun) sun.setAttribute('opacity', '1');
    svg.querySelector('#ring-layer')?.removeAttribute('mask');
    if (hint) hint.style.opacity = '1';
    return;
  }

  // 1) 太陽フェードイン
  tween({
    duration: 1400,
    easing: easeOutCubic,
    onUpdate: (v) => sun.setAttribute('opacity', String(v)),
  });

  // 2) リングのクロックワイプ（太陽フェードインに少し重ねて開始）
  const RING_START = 1000;
  const RING_DUR = 1000;
  const WIPE_OVERSHOOT = 1.05; // 1周(=1)を少し超えて、終端のシームをリング外側に追い出す
  tween({
    delay: RING_START,
    duration: RING_DUR,
    easing: easeInCubic,
    onUpdate: (v) => wipe.setAttribute('stroke-dasharray', `${v * WIPE_OVERSHOOT} 1`),
    onDone: () => {
      // アニメ完了後はマスク自体を外し、シームの影響を完全に排除
      svg.querySelector('#ring-layer')?.removeAttribute('mask');
    },
  });

  // 3) スクロール誘導（リング完成の約3秒後）
  if (hint) {
    tween({
      delay: RING_START + RING_DUR + 3000,
      duration: 900,
      easing: easeOutCubic,
      onUpdate: (v) => { hint.style.opacity = String(v); },
    });
  }
}

// ============================
// スクロール連動パララックス（PC）
// スクロール進捗 0→1 を :root の CSS変数 --p に書き込むだけ。
// 実際の動き（リングが左へ・右カラムがイン）は style.css 側が --p を見て行う。
// ============================

// スクロール量→進捗に掛けるイージング。
// 「少しのスクロールで一気に出てきて、あとはゆっくり収束」= ease-out。
//   ・もっと急にしたい  → 指数を上げる（1 - (1-t)**4 など）
//   ・等速に戻したい    → return t; にする
const easeScroll = (t) => 1 - Math.pow(1 - t, 3); // easeOutCubic

function setupParallax() {
  // モバイルは横パララックス無効（縦積みレイアウトは別マイルストーン）
  if (window.innerWidth <= 768) return;

  const root = document.documentElement;
  const hint = document.getElementById('scroll-hint');
  let ticking = false;

  function update() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const linear = max > 0
      ? Math.min(1, Math.max(0, window.scrollY / max))
      : 0;

    // 等速のスクロール量をイージングでカーブさせる（front-load）
    const progress = easeScroll(linear);

    // CSS側が translateX 等に反映する
    root.style.setProperty('--p', progress.toFixed(4));

    // スクロールし始めたらスクロール誘導をフェードアウト
    // （進捗0のときはオープニング演出に任せて触らない）
    if (hint && progress > 0.001) {
      hint.style.opacity = String(1 - progress);
    }

    ticking = false;
  }

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    },
    { passive: true }
  );

  update(); // 初期化
}

// ============================
// モバイル縦スクロール（スマホ）
// リング表示エリアの高さを --mp で縮め、コンテンツを下からフワっと立ち上げる。
// 動き自体は style.css 側（@media max-width:768px）が --mp と .in-view を見て行う。
// ============================
const RING_BAND_VH = 26; // ★固定時に残すバンド高さ。style.css の --ring-band と揃える

function setupMobileScroll() {
  if (window.innerWidth > 768) return;

  const root = document.documentElement;
  const hint = document.getElementById('scroll-hint');
  const datetime = document.getElementById('current-datetime');

  // 各セクションを下からフワっと表示
  const blocks = document.querySelectorAll('#content-panel .content-block');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in-view');
            io.unobserve(e.target); // 一度出たら監視解除
          }
        }
      },
      { threshold: 0.2 }
    );
    blocks.forEach((b) => io.observe(b));
  } else {
    blocks.forEach((b) => b.classList.add('in-view'));
  }

  // スクロール進捗 --mp（リング表示エリアの縮小用, 0→1）
  let ticking = false;
  function update() {
    const bandPx = window.innerHeight * (RING_BAND_VH / 100);
    const denom = window.innerHeight - bandPx; // リングが縮みきるまでのスクロール量
    const mp = denom > 0
      ? Math.min(1, Math.max(0, window.scrollY / denom))
      : 0;
    root.style.setProperty('--mp', mp.toFixed(4));

    // スクロールに従ってスクロール誘導・時刻表示をフェードアウト
    if (hint && mp > 0.001) hint.style.opacity = String(1 - mp);
    if (datetime && mp > 0.001) datetime.style.opacity = String(1 - mp);

    ticking = false;
  }

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    },
    { passive: true }
  );

  update(); // 初期化
}


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
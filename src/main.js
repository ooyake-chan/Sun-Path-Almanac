/**
 * main.js
 * エントリポイント。フォントロード完了を待ってからリングを描画する。
 */
import { renderRing, renderCurrentMomentSun } from './renderer.js';

// 地点プリセット（世界の太陽高度モード）。
//   mode: 'almanac'    … 東京。季節色＋二十四節気マーカー
//         'observatory' … 東京以外。白黒・太陽高度のみ（節気/季節色なし）
const PRESETS = {
  tokyo:     { key: 'tokyo',     label: '東京',         lat: 35.44,  lon: 139.45, tz: 'Asia/Tokyo',       mode: 'almanac' },
  singapore: { key: 'singapore', label: 'シンガポール', lat: 1.35,   lon: 103.82, tz: 'Asia/Singapore',   mode: 'observatory' },
  sydney:    { key: 'sydney',    label: 'シドニー',     lat: -33.87, lon: 151.21, tz: 'Australia/Sydney', mode: 'observatory' },
  arctic:    { key: 'arctic',    label: '北極圏',       lat: 69.65,  lon: 18.96,  tz: 'Europe/Oslo',      mode: 'observatory' }, // トロムソ
};

// 現在選択中の地点（既定: 東京）
let current = PRESETS.tokyo;

// 緯度経度の表示文字列（南緯/西経も対応）
function formatCoords(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}  ${Math.abs(lon).toFixed(2)}°${ew}`;
}

/** 現在JST時刻の年（西暦） */
function getCurrentJstYear() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  return jst.getUTCFullYear();
}

// ---- モバイルのズーム状態（タップで全体/拡大を切り替え。プリセット切替でも中心を更新） ----
const MOBILE_FULL_VIEWBOX = '-18 -10 38 38'; // index.html の初期値と合わせる
const MOBILE_ZOOM = 15;                       // 小さいほど拡大
let mobileZoomed = false;
let mobileSunXY = [0, 0];

function applyMobileViewBox(svg) {
  if (mobileZoomed) {
    const [sx, sy] = mobileSunXY;
    const z = MOBILE_ZOOM;
    svg.setAttribute('viewBox', `${sx - z / 2} ${sy - z / 3} ${z} ${z}`);
  } else {
    svg.setAttribute('viewBox', MOBILE_FULL_VIEWBOX);
  }
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
  document.getElementById('coords').textContent = formatCoords(current.lat, current.lon);

  const svg = document.getElementById('ring-svg');
  renderRing(svg, year, current.lat, current.lon, current.mode);

  // スマホ拡大用（初期は今日にズームイン）
  const [sx, sy] = renderCurrentMomentSun(svg, year, current.lat, current.lon);
  if (window.innerWidth <= 768) {
    mobileSunXY = [sx, sy];
    mobileZoomed = true;
    applyMobileViewBox(svg);

    // タップで全体/拡大を切り替え
    svg.addEventListener('click', () => {
      mobileZoomed = !mobileZoomed;
      applyMobileViewBox(svg);
    });
  }

  updateDateTime();
  setInterval(updateDateTime, 1_000);
  setInterval(() => {
    renderCurrentMomentSun(svg, year, current.lat, current.lon);
  }, 15_000);

  // オープニング演出
  playIntro(svg);

  // スクロール連動パララックス（PCのみ）
  setupParallax();

  // モバイル縦スクロール（スマホのみ）
  setupMobileScroll();

  // 世界の太陽高度モードのボタン
  setupPresetButtons();
}

function updateDateTime() {
  // 選択中の地点の現地時刻（タイムゾーン=その土地の時計。夏時間も自動考慮）
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: current.tz,
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
  const month = String(Number(get('month'))); // 先頭ゼロを除去（例 5/12）
  const day = String(Number(get('day')));
  document.getElementById('current-date').textContent = `${month}/${day}`;
  document.getElementById('current-time').textContent =
    `${get('hour')}:${get('minute')}:${get('second')}`;
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

/**
 * プリセット切り替え時のクイック表示。
 * オープニングより短いワイプ＋太陽フェード（スクロール誘導は触らない）。
 */
function revealRing(svg, { sunDur = 700, wipeDur = 800 } = {}) {
  const sun = svg.querySelector('#sun-marker');
  const wipe = svg.querySelector('#wipe-circle');
  const ringLayer = svg.querySelector('#ring-layer');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduce || !sun || !wipe) {
    if (sun) sun.setAttribute('opacity', '1');
    ringLayer?.removeAttribute('mask');
    return;
  }

  tween({
    duration: sunDur,
    easing: easeOutCubic,
    onUpdate: (v) => sun.setAttribute('opacity', String(v)),
  });

  const WIPE_OVERSHOOT = 1.05;
  tween({
    duration: wipeDur,
    easing: easeInCubic,
    onUpdate: (v) => wipe.setAttribute('stroke-dasharray', `${v * WIPE_OVERSHOOT} 1`),
    onDone: () => ringLayer?.removeAttribute('mask'),
  });
}

// ============================
// 世界の太陽高度モード（地点プリセットの切り替え）
// ============================
function applyPreset(key) {
  const p = PRESETS[key];
  if (!p) return;
  current = p;

  // ボタンのアクティブ表示
  document.querySelectorAll('#world-mode .mode-btn').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.preset === key);
  });

  // 左上の座標表示・時計を更新
  document.getElementById('coords').textContent = formatCoords(p.lat, p.lon);
  updateDateTime();

  // 再描画（東京=暦モード / その他=白黒観測モード）
  const svg = document.getElementById('ring-svg');
  const year = getCurrentJstYear();
  renderRing(svg, year, p.lat, p.lon, p.mode);

  // モバイルは新しい太陽位置にズーム中心を合わせ直す
  if (window.innerWidth <= 768) {
    const coords = renderCurrentMomentSun(svg, year, p.lat, p.lon);
    if (coords) mobileSunXY = coords;
    applyMobileViewBox(svg);
  }

  // クイック表示（ワイプ＋太陽フェード）
  revealRing(svg);
}

function setupPresetButtons() {
  const btns = document.querySelectorAll('#world-mode .mode-btn');
  btns.forEach((b) => {
    b.addEventListener('click', () => applyPreset(b.dataset.preset));
    b.classList.toggle('is-active', b.dataset.preset === current.key);
  });
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

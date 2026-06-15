/**
 * renderer.js
 * SVGにリングと節気マーカー、現在時刻マーカーを描画する
 */
import { calculateAltitude, daysInYear } from './sun-path-core.js';
import { get24SolarTermsJst } from './solar-terms.js';

// ============================
// 定数（poster/design_24terms_v3.py と同一）
// ============================
const BASE_RADIUS = 10;
const ALTITUDE_SCALE = 0.06;
const HORIZON_COLOR = '#5a4032';

const MAJOR_TERMS = new Set([0, 90, 180, 270]); // 二分二至
const SECONDARY_TERMS = new Set([45, 135, 225, 315]); // 四立

// poster/design_24terms_v3.py の season_colors と同一
const SEASON_COLORS = [
  [0.0000, '#57738f'],
  [0.0452, '#6c8ba8'],
  [0.1452, '#bfd4a4'],
  [0.2452, '#e6c8a3'],
  [0.3952, '#e8a16b'],
  [0.4952, '#d96f4a'],
  [0.6452, '#a8493e'],
  [0.7452, '#7d4d52'],
  [0.8452, '#4f4666'],
  [0.9452, '#3e5570'],
  [1.0000, '#57738f'],
];

// ============================
// ヘルパー
// ============================
const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function hexToRgb(hex) {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function rgbToHex(r, g, b) {
  const c = (n) =>
    Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

/** 季節カラーマップから色を線形補間して返す */
function interpolateSeasonColor(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < SEASON_COLORS.length - 1; i++) {
    const [t1, c1] = SEASON_COLORS[i];
    const [t2, c2] = SEASON_COLORS[i + 1];
    if (t >= t1 && t <= t2) {
      const u = (t - t1) / (t2 - t1);
      const [r1, g1, b1] = hexToRgb(c1);
      const [r2, g2, b2] = hexToRgb(c2);
      return rgbToHex(
        r1 + (r2 - r1) * u,
        g1 + (g2 - g1) * u,
        b1 + (b2 - b1) * u
      );
    }
  }
  return SEASON_COLORS[SEASON_COLORS.length - 1][1];
}

/**
 * 極座標 (r, theta) → SVG (x, y)
 * theta=0 が1月1日（リング上部）、時計回りに増加
 * SVG座標系は y が下向き正のため反転している
 */
function polarToXY(r, theta) {
  return [r * Math.sin(theta), -r * Math.cos(theta)];
}

// ============================
// メイン描画関数
// ============================
export function renderRing(svg, year, lat, lon) {
  const nDays = daysInYear(year);
  const terms = get24SolarTermsJst(year);

  // 既存の子要素をクリア
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  // ---- defs: 星型シンボル（外部 starbig.svg / starsmall.svg から流用） ----
  // fill="currentColor" にすることで <use style="color: ..."> で色を上書き可能。
  const defs = el('defs');
  defs.innerHTML = `
    <symbol id="star-big" viewBox="0 0 16 16">
      <g transform="matrix(1,0,0,1,-2346.580377,-1380.409688)">
        <g transform="matrix(0.947308,-0.947308,0.947308,0.947308,1972.935407,1605.383745)">
          <path d="M320.114,82.626C320.114,82.626 318.917,84.961 318.917,86.777C318.917,88.592 320.114,90.937 320.114,90.937C320.114,90.937 317.772,89.737 316.012,89.737C314.252,89.737 311.802,90.937 311.802,90.937C311.802,90.937 313.009,88.341 313.009,86.777C313.009,85.213 311.802,82.626 311.802,82.626C311.802,82.626 314.216,83.83 315.949,83.83C317.681,83.83 320.114,82.626 320.114,82.626Z" fill="currentColor"/>
        </g>
      </g>
    </symbol>
    <symbol id="star-small" viewBox="0 0 7 7">
      <g transform="matrix(1,0,0,1,-2419.910912,-1389.284132)">
        <g transform="matrix(0.413439,-0.413439,0.413439,0.413439,2256.838896,1487.47085)">
          <path d="M320.114,82.626C320.114,82.626 318.917,84.961 318.917,86.777C318.917,88.592 320.114,90.937 320.114,90.937C320.114,90.937 317.772,89.737 316.012,89.737C314.252,89.737 311.802,90.937 311.802,90.937C311.802,90.937 313.009,88.341 313.009,86.777C313.009,85.213 311.802,82.626 311.802,82.626C311.802,82.626 314.216,83.83 315.949,83.83C317.681,83.83 320.114,82.626 320.114,82.626Z" fill="currentColor"/>
        </g>
      </g>
    </symbol>

    <!-- オープニング用クロックワイプ・マスク。
         半径11・線幅22の円で中心(0,0)から外周まで塗りつぶし、
         stroke-dasharray の dash側を 0→1.05 にアニメすると 12時起点・時計回りに開く。
         初期値 dash=0（=リング非表示）。playIntro() が dash=1.05 までアニメする。 -->
    <mask id="clock-wipe" maskUnits="userSpaceOnUse" x="-25" y="-25" width="50" height="50">
      <circle id="wipe-circle" cx="0" cy="0" r="11" fill="none" stroke="#ffffff"
              stroke-width="22" pathLength="1" stroke-dasharray="0 1"
              transform="rotate(-90 0 0)" />
    </mask>
  `;
  svg.appendChild(defs);

  // ---- リング本体を1つのグループにまとめ、クロックワイプ・マスクを掛ける ----
  // （太陽マーカーはこのグループの外＝マスク対象外に置く）
  const ringLayer = el('g', { id: 'ring-layer', mask: 'url(#clock-wipe)' });
  svg.appendChild(ringLayer);

  // ---- 地平線 ----
  ringLayer.appendChild(
    el('circle', {
      cx: 0,
      cy: 0,
      r: BASE_RADIUS,
      fill: 'none',
      stroke: HORIZON_COLOR,
      'stroke-width': '0.06',
      opacity: '0.6',
    })
  );

  // ---- 365本の太陽軌跡 ----
  const HOUR_STEPS = 200;
  for (let i = 0; i < nDays; i++) {
    let d = '';
    for (let j = 0; j <= HOUR_STEPS; j++) {
      const h = (j / HOUR_STEPS) * 24;
      const alt = calculateAltitude(lat, i + 1, h);
      const theta = (2 * Math.PI * (i + h / 24)) / nDays;
      const r = BASE_RADIUS + alt * ALTITUDE_SCALE;
      const [x, y] = polarToXY(r, theta);
      d += (j === 0 ? 'M ' : ' L ') + x.toFixed(4) + ' ' + y.toFixed(4);
    }
    const color = interpolateSeasonColor(i / nDays);
    ringLayer.appendChild(
      el('path', {
        d,
        fill: 'none',
        stroke: color,
        'stroke-width': '0.02', //描画線の太さ
        opacity: '0.78',
      })
    );
  }

  // ---- 節気マーカー＋ラベル ----
  for (const t of terms) {
    const doy = t.dayOfYear;
    if (doy < 0 || doy >= nDays) continue;

    // 南中時のtheta（その日の中央＝12時）
    const thetaNoon = (2 * Math.PI * (doy + 0.5)) / nDays;

    // 南中高度（→マーカーをここに置く＝外周ガイド円なし）
    const altNoon = calculateAltitude(lat, doy + 1, 12);
    const rNoon = BASE_RADIUS + altNoon * ALTITUDE_SCALE;
    const [mx, my] = polarToXY(rNoon, thetaNoon);

    const isMajor = MAJOR_TERMS.has(t.longitude);
    const isSec = SECONDARY_TERMS.has(t.longitude);

    // 種別ごとのスタイル
    // マーカー形状: 二分二至＋四立 → star-big、その他16節気 → star-small
    let markerColor, markerSize, symbolId,
        kanjiColor, kanjiSize, kanjiFamily, dateColor, dateSize;
    if (isMajor) {
      // 二分二至
      markerColor = '#FFFFFF';
      markerSize = 0.8;
      symbolId = '#star-big';
      kanjiColor = '#FFFFFF';
      kanjiSize = 1.4;
      kanjiFamily = 'HakkouMincho, serif';
      dateColor = '#FFFFFF';
      dateSize = 0.65;
    } else if (isSec) {
      // 四立
      markerColor = '#FFFFFF';
      markerSize = 0.3;
      symbolId = '#star-big';
      kanjiColor = '#FFFFFF';
      kanjiSize = 1.0;
      kanjiFamily = 'HakkouMincho, serif';
      dateColor = '#FFFFFF';
      dateSize = 0.55;
    } else {
      // その他16節気
      markerColor = '#FFFFFF';
      markerSize = 0.3;
      symbolId = '#star-small';
      kanjiColor = '#FFFFFF';
      kanjiSize = 0.7;
      kanjiFamily = '"Noto Serif JP", serif';
      dateColor = '#FFFFFF';
      dateSize = 0.55;
    }

    // マーカー（星型シンボル参照、color で fill 上書き）
    ringLayer.appendChild(
      el('use', {
        href: symbolId,
        x: mx - markerSize / 2,
        y: my - markerSize / 2,
        width: markerSize,
        height: markerSize,
        style: `color: ${markerColor}`,
      })
    );

    // ラベル: 日付（上）／節気（下）の2段を縦に積んで、放射方向外側にオフセット
    // 「アンカー点」 = マーカーから radial に少し外へ離した位置
    const anchorOffset = 1.4 + kanjiSize * 0.4;
    const anchorR = rNoon + anchorOffset;
    const [ax, ay] = polarToXY(anchorR, thetaNoon);

    // 縦方向の積み（スクリーン上のY方向）
    // 日付（上）と漢字（下）の間が 0.5em くらいになるよう調整
    const dateY = ay - kanjiSize * 0.55;
    const kanjiY = ay + kanjiSize * 0.35;

    // 日付
    const dateText = el('text', {
      x: ax,
      y: dateY,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      fill: dateColor,
      'font-size': dateSize,
      'font-family': '"HangyakuMincho", serif',
    });
    const month = t.datetime.getUTCMonth() + 1;
    const day = t.datetime.getUTCDate();
    dateText.textContent = `${month}/${day}`;
    ringLayer.appendChild(dateText);

    // 漢字
    const kanjiText = el('text', {
      x: ax,
      y: kanjiY,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      fill: kanjiColor,
      'font-size': kanjiSize,
      'font-family': kanjiFamily,
    });
    kanjiText.textContent = t.kanji;
    ringLayer.appendChild(kanjiText);
  }

  // ---- 現在時刻の太陽マーカー（ringLayer の外＝マスク対象外） ----
  renderCurrentMomentSun(svg, year, lat);
}

/** 現在JST時刻の太陽位置に sum.svg を配置 */
export function renderCurrentMomentSun(svg, year, lat) {
  const nDays = daysInYear(year);
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 3600 * 1000);
  // ↓テスト用手入力時刻　↑本番用時刻
  //const jstNow = new Date(Date.UTC(year, 5, 22, 0, 0, 0));

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const doyDecimal = (jstNow.getTime() - yearStart.getTime()) / 86400000;

  if (doyDecimal < 0 || doyDecimal >= nDays) return;

  const doyInt = Math.floor(doyDecimal) + 1;
  const hourOfDay = (doyDecimal - Math.floor(doyDecimal)) * 24;
  const altNow = calculateAltitude(lat, doyInt, hourOfDay);
  const thetaNow = (2 * Math.PI * doyDecimal) / nDays;
  const rNow = BASE_RADIUS + altNow * ALTITUDE_SCALE;
  const [sx, sy] = polarToXY(rNow, thetaNow);

  const existing = svg.querySelector('#sun-marker');
  if(existing){
    existing.setAttribute('transform', `translate(${sx}, ${sy})`);
    return[sx, sy];
  }

  // sum.svg を <image> で参照（外部SVGをそのままラスタライズして表示）
  // opacity 0 で生成し、playIntro() がフェードインさせる。
  const SUN_SIZE = 5;
   const g = el('g', { id: 'sun-marker', transform: `translate(${sx}, ${sy})`, opacity: '0' });
  const sunImg = el('image', {
    href: 'sun.svg',
    x: -SUN_SIZE / 2,
    y: -SUN_SIZE / 2,
    width: SUN_SIZE,
    height: SUN_SIZE,
  });

  // 自分の中心を軸にゆっくり回転
  const anim = el('animateTransform', {
    attributeName: 'transform',
    type: 'rotate',
    from: '0 0 0',
    to: '360 0 0',
    dur: '1200s',              // ← ここで速さを調整（数字を大きくするほど遅い）
    repeatCount: 'indefinite',
  });

sunImg.appendChild(anim);
g.appendChild(sunImg);
svg.appendChild(g);


}

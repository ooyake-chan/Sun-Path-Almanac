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
    svg.setAttribute('viewBox', `${sx - zoom/2} ${sy - zoom/3} ${zoom} ${zoom}`);
}

  updateDateTime();
  setInterval(updateDateTime, 1_000);
  setInterval(() => {
    renderCurrentMomentSun(svg, year, LAT);
}, 15_000);
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


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
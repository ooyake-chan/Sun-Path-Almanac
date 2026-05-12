/**
 * solar-terms.js
 * 二十四節気の天文計算
 * 太陽黄経が15°刻みになる瞬間を Meeus法+Newton-Raphson で求める
 * Pythonの solar_terms.py を移植したもの
 */
import { jdToDatetimeUtc } from './sun-path-core.js';

const DEG_TO_RAD = Math.PI / 180;

// 二十四節気: [黄経°, 漢字, 英語, 典型月, 典型日]
const SOLAR_TERMS = [
  [315, '立春', 'Lichun',      2,  4],
  [330, '雨水', 'Yushui',      2, 19],
  [345, '啓蟄', 'Jingzhe',     3,  6],
  [  0, '春分', 'Chunfen',     3, 20],
  [ 15, '清明', 'Qingming',    4,  5],
  [ 30, '穀雨', 'Guyu',        4, 20],
  [ 45, '立夏', 'Lixia',       5,  5],
  [ 60, '小満', 'Xiaoman',     5, 21],
  [ 75, '芒種', 'Mangzhong',   6,  6],
  [ 90, '夏至', 'Xiazhi',      6, 21],
  [105, '小暑', 'Xiaoshu',     7,  7],
  [120, '大暑', 'Dashu',       7, 23],
  [135, '立秋', 'Liqiu',       8,  8],
  [150, '処暑', 'Chushu',      8, 23],
  [165, '白露', 'Bailu',       9,  8],
  [180, '秋分', 'Qiufen',      9, 23],
  [195, '寒露', 'Hanlu',      10,  8],
  [210, '霜降', 'Shuangjiang', 10, 23],
  [225, '立冬', 'Lidong',     11,  7],
  [240, '小雪', 'Xiaoxue',    11, 22],
  [255, '大雪', 'Daxue',      12,  7],
  [270, '冬至', 'Dongzhi',    12, 22],
  [285, '小寒', 'Xiaohan',     1,  6],
  [300, '大寒', 'Dahan',       1, 20],
];

/** 太陽の見かけの黄経（度）。Meeus簡略版、誤差0.01°程度 */
function solarLongitude(jde) {
  const T = (jde - 2451545.0) / 36525.0;
  let L0 = (280.46646 + 36000.76983 * T + 0.0003032 * T * T) % 360;
  if (L0 < 0) L0 += 360;
  let Mdeg = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360;
  if (Mdeg < 0) Mdeg += 360;
  const M = Mdeg * DEG_TO_RAD;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  let result = (L0 + C) % 360;
  if (result < 0) result += 360;
  return result;
}

/** グレゴリオ暦 → Julian Day（簡易版） */
function dateToJd(year, month, day, hour = 0) {
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  const JD =
    Math.floor(365.25 * (year + 4716)) +
    Math.floor(30.6001 * (month + 1)) +
    day +
    B -
    1524.5;
  return JD + hour / 24.0;
}

/** 指定された目標黄経になる時刻のJDEをNewton-Raphsonで求める */
function findSolarTermJde(year, targetLon, hintMonth, hintDay) {
  let jde = dateToJd(year, hintMonth, hintDay);
  for (let i = 0; i < 20; i++) {
    const L = solarLongitude(jde);
    let diff = targetLon - L;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    if (Math.abs(diff) < 1e-7) break;
    jde += diff / 0.9856; // 太陽は約 0.9856°/日 動く
  }
  return jde;
}

/**
 * 指定年の二十四節気を日本標準時で返す。
 * 返値: 配列 of { longitude, kanji, english, datetime, dayOfYear }
 *   datetime はJST時刻だが、JavaScript Dateの内部はUTCのため
 *   getUTC* メソッドで読むとJSTの値が取れるよう調整済み。
 */
export function get24SolarTermsJst(year) {
  const out = [];
  for (const [lon, kanji, eng, hm, hd] of SOLAR_TERMS) {
    let jde = findSolarTermJde(year, lon, hm, hd);
    let utc = jdToDatetimeUtc(jde);
    let jst = new Date(utc.getTime() + 9 * 3600 * 1000);

    // 大寒/小寒は前後年に来ることがあるので補正
    if (jst.getUTCFullYear() !== year) {
      for (const adj of [-1, 1]) {
        const jde2 = findSolarTermJde(year + adj, lon, hm, hd);
        const jst2 = new Date(jdToDatetimeUtc(jde2).getTime() + 9 * 3600 * 1000);
        if (jst2.getUTCFullYear() === year) {
          jst = jst2;
          break;
        }
      }
    }

    const startOfYear = new Date(Date.UTC(year, 0, 1));
    const dayOfYear = Math.floor(
      (jst.getTime() - startOfYear.getTime()) / 86400000
    );

    out.push({
      longitude: lon,
      kanji: kanji,
      english: eng,
      datetime: jst,
      dayOfYear: dayOfYear,
    });
  }
  return out;
}

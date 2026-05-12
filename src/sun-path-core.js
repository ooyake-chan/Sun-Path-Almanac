/**
 * sun-path-core.js
 * 太陽軌跡ポスターの天文計算モジュール
 * Pythonの sun_path_core.py を移植したもの
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// ==========================================
// Meeus 二分二至計算 (Astronomical Algorithms Ch.27)
// 1000年〜3000年の範囲で誤差数分以内
// ==========================================
const SEASON_COEFS = {
  spring: [2451623.80984, 365242.37404,  0.05169, -0.00411, -0.00057],
  summer: [2451716.56767, 365241.62603,  0.00325,  0.00888, -0.00030],
  autumn: [2451810.21715, 365242.01767, -0.11575,  0.00337,  0.00078],
  winter: [2451900.05952, 365242.74049, -0.06223, -0.00823,  0.00032],
};

// Meeus Table 27.C: 周期項
const PERIODIC_TERMS = [
  [485, 324.96,   1934.136],
  [203, 337.23,  32964.467],
  [199, 342.08,     20.186],
  [182,  27.85, 445267.112],
  [156,  73.14,  45036.886],
  [136, 171.52,  22518.443],
  [ 77, 222.54,  65928.934],
  [ 74, 296.72,   3034.906],
  [ 70, 243.58,   9037.513],
  [ 58, 119.81,  33718.147],
  [ 52, 297.17,    150.678],
  [ 50,  21.02,   2281.226],
  [ 45, 247.54,  29929.562],
  [ 44, 325.15,  31555.956],
  [ 29,  60.93,   4443.417],
  [ 18, 155.12,  67555.328],
  [ 17, 288.79,   4562.452],
  [ 16, 198.04,  62894.029],
  [ 14, 199.76,  31436.921],
  [ 12,  95.39,  14577.848],
  [ 12, 287.11,  31931.756],
  [ 12, 320.81,  34777.259],
  [  9, 227.73,   1222.114],
  [  8,  15.45,  16859.074],
];

/** Meeus法で季節点のJDE（力学時のJulian Day）を計算 */
export function equinoxSolsticeJde(year, season) {
  const Y = (year - 2000) / 1000.0;
  const [a, b, c, d, e] = SEASON_COEFS[season];
  const JDE0 = a + b * Y + c * Y * Y + d * Y * Y * Y + e * Y * Y * Y * Y;

  const T = (JDE0 - 2451545.0) / 36525.0;
  const W = (35999.373 * T - 2.47) * DEG_TO_RAD;
  const Lambda = 1 + 0.0334 * Math.cos(W) + 0.0007 * Math.cos(2 * W);

  let S = 0;
  for (const [A, B, C] of PERIODIC_TERMS) {
    S += A * Math.cos((B + C * T) * DEG_TO_RAD);
  }
  return JDE0 + (0.00001 * S) / Lambda;
}

/** Julian Day → JavaScript Date (UTC) */
export function jdToDatetimeUtc(jd) {
  const jdPlus = jd + 0.5;
  const Z = Math.floor(jdPlus);
  const F = jdPlus - Z;
  let A;
  if (Z < 2299161) {
    A = Z;
  } else {
    const alpha = Math.floor((Z - 1867216.25) / 36524.25);
    A = Z + 1 + alpha - Math.floor(alpha / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const dayDecimal = B - D - Math.floor(30.6001 * E) + F;
  const day = Math.floor(dayDecimal);
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  const fday = dayDecimal - day;
  const hours = fday * 24;
  const h = Math.floor(hours);
  const minutes = (hours - h) * 60;
  const m = Math.floor(minutes);
  const s = Math.floor((minutes - m) * 60);
  return new Date(Date.UTC(year, month - 1, day, h, m, s));
}

// ==========================================
// 太陽位置: Spencer の式（精度 0.5° 以内、軽量）
// ==========================================

/** 太陽赤緯（度） */
export function solarDeclination(dayOfYear) {
  const gamma = (2 * Math.PI * (dayOfYear - 1)) / 365.0;
  const delta =
    0.006918
    - 0.399912 * Math.cos(gamma)
    + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma)
    + 0.00148  * Math.sin(3 * gamma);
  return delta * RAD_TO_DEG;
}

/** 太陽高度（度）。極地でも対応 */
export function calculateAltitude(lat, dayOfYear, hour) {
  const delta = solarDeclination(dayOfYear);
  const H = (hour - 12) * 15 * DEG_TO_RAD;
  const latRad = lat * DEG_TO_RAD;
  const deltaRad = delta * DEG_TO_RAD;
  const sinH =
    Math.sin(latRad) * Math.sin(deltaRad) +
    Math.cos(latRad) * Math.cos(deltaRad) * Math.cos(H);
  return Math.asin(Math.max(-1, Math.min(1, sinH))) * RAD_TO_DEG;
}

/** 年内の日数（うるう年判定） */
export function daysInYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

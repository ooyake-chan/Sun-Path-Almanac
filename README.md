# 太陽と暦のカレンダー（WEB版）

ポスター版（`../poster/`）と同じ計算ロジックを JavaScript に移植し、ブラウザ上でリアルタイム描画する WEB 版。

## マイルストーン1（現状）

カンプ「WEB版デザインカンプ.jpg」相当の静的状態を実装：

- リング描画（365日×24時間の太陽軌跡）
- 二十四節気マーカー（南中位置に配置、外周ガイド円なし）
- 節気ラベル（日付＋漢字を縦積み）
- 左上：年・緯度経度
- 現在時刻の光るマーカー（**ページロード時点で固定**）

## 今後のマイルストーン

- **M2**：現在時刻マーカーをリアルタイム更新（1秒ごとなど）
- **M3**：スクロールでパララックス、右カラム（商品説明・ショップリンク）追加
- **M4**：スマホ最適化、タップでズームイン/アウト

## ファイル構成

```
web/
├── index.html              ← ページ本体
├── style.css               ← フォント定義・レイアウト
├── font/
│   ├── HakkouMincho.ttf    ← 白光明朝（タイトル・二分二至・四立用）
│   └── Hangyaku-drwnR.ttf  ← 叛逆明朝（日付・時刻用）
├── src/
│   ├── sun-path-core.js    ← 天文計算（poster の sun_path_core.py 移植）
│   ├── solar-terms.js      ← 二十四節気計算（同 solar_terms.py 移植）
│   ├── renderer.js         ← SVG描画
│   └── main.js             ← エントリポイント
└── README.md               ← このファイル
```

## 起動方法

ES Modules を使用しているため、**ファイルを直接開く（`file://`）と動きません**。  
ローカルサーバ経由でアクセスする必要があります。

### 方法1：Python の組み込みサーバ（最短）

```powershell
cd "C:\Users\user\同期用\製作中\solar-terms\web"
python -m http.server 8000
```

ブラウザで <http://localhost:8000/> を開く。

### 方法2：VS Code の Live Server 拡張

1. 拡張機能「Live Server」（Ritwick Dey）をインストール
2. `index.html` を右クリック → 「Open with Live Server」
3. 自動でブラウザが開く

### 方法3：Node.js の `npx serve`

```powershell
cd "C:\Users\user\同期用\製作中\solar-terms\web"
npx serve
```

## 使用フォント

| フォント名 | 用途 | 配置 |
|---|---|---|
| HakkouMincho（白光明朝） | タイトル「2026」、緯度経度、二分二至・四立の漢字、説明文見出し | `font/HakkouMincho.ttf` |
| Hangyaku-drwnR（叛逆明朝） | 節気の日付、時刻表示 | `font/Hangyaku-drwnR.ttf` |
| Noto Serif JP Medium | その他16節気の漢字、本文 | Google Fonts CDN |

## 設計メモ

- `BASE_RADIUS`、`ALTITUDE_SCALE`、色グラデーション等のパラメータは **poster 版と完全同一**
- 節気マーカーの配置半径だけ poster と異なる：poster は仮の外周円（`OUTER_RING`）、WEB版は **その日の南中高度位置** (`BASE_RADIUS + alt_noon * ALTITUDE_SCALE`)
- 時刻は **JST 固定**（東京の太陽軌跡のため）
- リング描画は SVG。`viewBox="-22 -22 44 44"` の単位空間で描画し、CSS で表示サイズを制御

## ライセンス

カスタムフォントの利用規約は配布元の規約に従う（商用利用可確認済み）。

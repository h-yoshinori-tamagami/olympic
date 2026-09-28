# デザイン方針

## 画面の目的と構成

- **目的**：プレー中にホールとプレーヤーを選び、獲得メダルと差引点を短い操作で記録する。
- **ページ種別**：Product app / Operational form。
- **Hero**：なし。最初にラウンド操作と進行中ホールを見せる。
- **主操作**：新規ラウンドでは設定後に開始、進行中は各プレーヤーのメダル選択。
- **情報順**：ラウンド概要 → ホール移動 → プレーヤー別入力 → 獲得点・差引点 → 履歴・ルール。

ゴルフの記録作業では、背景を楽しませるより、ホールと入力対象、点数を見失わないことを優先する。スマートフォンではプレーヤーごとのカードにメダル選択をまとめ、各ホールの入力と累計を同じ場所で確認できるようにした。

## Reference basis

- [GolfCounter のオリンピック計算ツール](https://golf-counter.com/guide/golf-olympic/) は、1ホールの入力から全員の点をすぐに確認する流れと、差引合計0の検算を示している。ここから短い選択操作と明確な点数表示だけを採用した。
- [Golf Info Central のルール説明](https://enjoy-golfer.com/explain-olympic/) は、人数別のメダル構成、獲得点、差引計算を説明している。ルール表示と人数別の選択肢を構成する根拠にした。
- どちらのアプリ構成・画面デザインも複製せず、ラウンド履歴、再開、JSON バックアップなど本要件に必要な情報設計を追加した。

## Visual grounding

```yaml
design_target:
  user_goal: "ホールごとの獲得メダルを短く記録し、差引点を確認する"
  page_type: "product-app / operational form"
  ui_mode: "product-app"
base_structure:
  hero: absent
  first_view: "ラウンド作成または進行中ホールの入力"
  page_shell: "ブランドヘッダー、作業領域、補助ルール、控えめなフッター"
  content_order: ["ラウンド操作", "ホール進行", "プレーヤー入力", "差引検算", "履歴", "ルール"]
  density: "中程度。ホール移動は6列、入力は3列のタップ可能な選択肢"
  primary_action: "プレーヤーごとのメダルを選択"
```

### デザイントークン

| 用途 | 適用値 |
|---|---|
| Primary / Future Blue | `#0072BC` |
| Hover | `#005B96` |
| Smart Navy / 主テキスト | `#070F26` |
| 補助テキスト | `#526875` |
| Surface / Canvas | `#FFFFFF` / `#F4F7F9` |
| 基本文字 | Noto Sans JP / Noto Sans / system-ui の順。外部フォントを取得しない |
| 本文 | 16px、行間1.5 |
| 見出し | 22px、太字、行間1.2 |
| 余白 | 4 / 8 / 12 / 16 / 24 / 32px |
| 角丸 | 入力・ボタン4〜8px、まとまり12px |

色はブランドの連続性と読みやすさに使う。メダル色は選択肢の意味を助ける範囲に留め、選択状態は Future Blue の枠でも判別できる。選択対象はテキストと点数を併記し、色だけで意味を伝えない。

### 操作性・アクセシビリティ

- 主要ボタン・メダル選択・ホール番号は44px以上の高さを確保する。
- ネイティブの button / input / select を使い、キーボードフォーカスを青い外枠で示す。
- 320〜414px幅で横スクロールを避ける。プレーヤーカードとフォームは1列、メダルは3列にする。
- 「獲得点」と「差引点」を別々に表示し、各ホールとラウンドの差引合計0を確認できる。
- `prefers-reduced-motion` ではトランジションを抑える。

### NTT DATA ロゴと Genesis 表示

- `assets/brand/ntt-data-logo-future-blue-isolated.png` は prototype-design-bundle の支給済み公式ロゴを独立コピーしたもの。
- 元の透明 Isolation を含む PNG をトリミングせず、アプリ名とは別領域に配置する。表示幅164pxで可視ロゴ幅は約143pxとなり、通常時の最小可視幅110pxを上回る。
- 透明余白への重なり、負の margin、clip、overlay は使わない。追加の clear-space 用 padding は加えない。
- Footer に `Powered by Genesis` を補助情報として常時表示し、主要操作より強くしない。

## 参照した標準

`prototype-design-bundle/DESIGN.md` と `VISUAL_GROUNDING_HARNESS.md` の Product app 判断、Future Blue、Noto 系書体、操作対象サイズ、フォーカス表示、公式 Isolation logo、Footer 表示を適用した。公式画像自体は専用リポジトリ内に置き、実行時に別リポジトリを参照しない。

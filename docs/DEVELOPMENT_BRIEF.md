# 実装指示書 — ゴルフのオリンピック記録

## 目的と対象

`REQUIREMENTS.md` と `docs/MVP_DESIGN.md` の採用前提に沿い、`Genesis/olympic/` を `h-yoshinori-tamagami/olympic` 専用の独立リポジトリとして運用する。静的 HTML / CSS / vanilla JavaScript / JSON で、日本語のゴルフ・オリンピック記録アプリを作る。

2〜4人、9 / 18ホール、ホールごとのメダル記録、獲得点と差引点、ホール移動・修正、履歴・再開・削除、localStorage 自動保存、バージョン付き JSON 全件書出しと検証付き復元を対象とする。標準点数と説明は `rules.json` に置く。ログイン、同期、金額、派生ルール、ゴルフ場 / GPS は対象外。

## 技術・プライバシー制約

- 外部 CDN / 実行時ライブラリ / ビルド / バックエンドを追加しない。
- GitHub Pages の `https://h-yoshinori-tamagami.github.io/olympic/` に合わせ、コード・CSS・ロゴ・ルール JSON は相対パスで参照する。
- 利用者データを localStorage と利用者端末の JSON バックアップに限定し、公開 repo と Pages artifact に記録ファイルを含めない。
- 既存 `ec-bpr-console/` や他 App の資材・作業ツリーには触れない。
- この案件内の長文資料は日本語で書き、ファイル名・コード識別子は英語にする。

## 必ず守る制約

```text
【トークン節約の制約 — 必ず守ること】
1. 変更対象のファイル以外を読み込まない・開かない
2. ファイルの全文再出力をしない。差分編集（該当箇所のみの修正）で対応する
3. 説明文は最小限にする。実装の解説は求められた時のみ
4. 同じ内容の確認・要約の繰り返しをしない
5. この指示書の作業は1セッションで完結させる
```

## Step 0: 専用リポジトリと Git 管理

- `Genesis/olympic/` を独立した `h-yoshinori-tamagami/olympic` リポジトリとして扱い、親の Genesis repo に案件ファイルを混ぜない。
- Git の stage / commit / push / PR 作成はこの案件の `$git-workflow` / `git_ops` 委譲ルールに従う。親 agent が直接実行しない。
- GitHub repo が空なら、`git_ops` が必要最小限のベースコミットを `main` に作成して push する。機能実装は英語 topic branch `feat/olympic-score-app` に置き、base `main` 宛ての Draft PR を作成する。
- 通常 push が HTTP 403 で失敗した場合は再試行せず、repo の git workflow に定める REST API replay 手順を使う。
- PR タイトル、本文、GitHub コメントは日本語にする。PR には独立公開 repo であること、採用ルール、静的 / localStorage 制約、Pages URL、公開リスクを記載する。

## Step 1: 仕様と得点処理

- 4人では金4・銀3・銅2・鉄1、3人では金4・銀3・銅2、2人では金4・銀3。獲得なしは0点。
- ダイヤは初期有効、ラウンドごとに切替、グリーン外からの直接カップインで5点。
- `獲得点_i × (人数 − 1) − 他者の獲得点合計` を使い、各ホールとラウンドの差引総和を0にする。
- 4人の金4点 + 銅2点の例では `+10 / +2 / −6 / −6` になること。
- 点数を保存せず、メダル記録から表示時に導出する。

## Step 2: データ・バックアップ

- localStorage に schema version、rounds、active round / hole を保存する。
- JSON バックアップに識別可能な format と version を含め、全ラウンドを出力する。
- 復元前に format / version / 必須値 / 型 / 配列長 / 人数とホール数 / メダル選択可否 / ID 重複を検証する。
- 正常な検証後も、現在の全記録を置き換える確認を表示してから保存する。不正入力は既存データに適用しない。

## Step 3: UI 実装

【UIデザイン標準】
- Product app として hero を置かず、ホールとプレーヤー入力を先に見せること
- アプリ専用のオリジナル SVG ロゴを作成し、五輪リングや第三者ブランド表現を使わないこと
- フッターに「Powered by Genesis」を表示すること
- アクセントカラーはアプリ独自の Golf Green `#236246` を基本にすること

適用内容：メダル選択・ホール移動・主要ボタンは44px以上、色以外に文言や点数で意味を伝え、Focus と Contrast を見える状態にする。メダル色は意味の補助に限る。オリジナル SVG は app title と別の領域に置き、Footer credit は補助表示とする。

GolfCounter の1ホール入力 / 検算表示、Golf Info Central のルール / 計算説明を参考に、操作の短さと点数の明瞭さのみ反映する。既存サービスの画面構成・コピー・視覚表現は再現しない。

## Step 4: GitHub Pages

- `.github/workflows/pages.yml` は静的アプリ資材のみを artifact にし、`main` への push だけを Production 公開 trigger にする。feature branch の push では公開しない。
- Workflow source は GitHub Actions。必要な Pages 権限を job に限定し、URL を環境出力に設定する。
- `github-pages` deployment environment の branch policy も `main` だけを許可する。
- Pages の公開設定が未作成の場合は `git_ops` が GitHub 権限で Actions source を設定する。権限不足なら POA に blocker として報告する。

## Step 5: 確認・納品

- Task Brief に従い test files は作らず、test / build command は実行しない。
- 差引計算、人数別メダル、ダイヤ判定、localStorage、JSON 検証と置換順をソースから読み直し、重大な計算・データ処理ミスを自己点検する。
- `TEST_PLAN.md` には実施していない確認を Not run と記録し、test / build / browser verification は実行しない。
- `git_ops` は `feat/olympic-score-app` の日本語 Draft PR URL / 状態 / blocker、push 経路と SHA、Pages workflow / URL を POA に報告する。

# FP日報アプリ（React版）

旧版（単一HTMLファイル）から、Vite + React + Firebase構成に刷新したバージョンです。
IN評価分析システムと同じ技術構成（React/Vite + Firebase + Vercel）に揃えています。

## できること（フェーズ1・今回の納品分）

- 名前・メール・パスコードによる簡易ログイン（旧版と同じ）
- 日報登録（稼働日の追加・削除、au/UQ実績の自動計算、実績・見込み獲得入力、プレビュー・保存）
- 日報確認（検索・月フィルター・詳細表示）
- 日報の編集（**管理者だけでなく、本人が作成した日報も編集可能**）
- 実績確認（店舗別の集計）
- 店舗特徴（社内管理用メモ）
- 管理者ログイン
- 匿名認証 + Firebaseルール `auth != null`（誰でもアクセスできる状態は解消済み）

## 今回直した3つの不具合（設計レベルで解消）

旧HTML版はDOMを直接書き換える方式だったため、入力中の値が消えるバグが起きやすい構造でした。
React版では各日のデータを配列（state）で個別に保持するため、構造的にこの種のバグが起きません。

1. **au/UQタブを切り替えると実績が0になる** → 各日のデータを独立したstateで保持するよう変更。タブ切替時に他の日の値を上書きしない。
2. **稼働日を追加すると他の日の入力が消える** → 同上。日を追加してもReact stateの配列に新しい要素を足すだけなので、既存データは保持される。
3. **入力中に時間を空けると0から書き直し** → 入力内容を600ms毎にブラウザのlocalStorageへ自動保存。次回「日報登録」を開いたときに復元を提案する。

## 次のフェーズで追加予定（未実装）

- KPI管理（登録・週次集計・達成率表示）
- 個人実績（メンバー別ダッシュボード）
- 管理者画面（月次目標設定・ユーザー承認・KPI登録・稼働実績集計）
- ホーム画面の個人ダッシュボード

これらは旧HTML版のロジックを参考に、同じFirebaseの`fp_kpi`・`fp_personal`・`fp_users`等のパスへそのまま繋ぎ込めます（データ構造は変更していません）。

## セットアップ

```bash
npm install
npm run dev       # ローカル確認 (http://localhost:5173)
npm run build     # 本番ビルド → dist/ フォルダ
```

## Vercelへのデプロイ

1. このフォルダ一式をGitHubリポジトリにpush（IN dashboardと同じ流れ）
2. Vercelで「New Project」→ 対象リポジトリを選択
3. Framework Preset: **Vite** を選択（自動検出されるはず）
4. Build Command: `npm run build` / Output Directory: `dist`（自動設定されるはず）
5. デプロイ

GitHub Pagesは静的SPAのルーティングと相性が悪い（リロード時に404になりやすい）ため、IN dashboardと同じVercelに統一しています。

## Firebase設定（変更不要）

`src/lib/firebase.js` に旧版と同じFirebaseプロジェクト（`nippou-data-base`）の設定を入れているので、
データはそのまま引き継がれます。Firebaseルール・匿名認証の設定もすでに対応済みなので、追加作業は不要です。

## ディレクトリ構成

```
src/
  pages/        各画面（Login, Home, ReportForm, ReportList, ReportDetail, Stats, Stores, AdminLogin, ComingSoon）
  components/   共通レイアウト（ヘッダー・サイドバー）
  contexts/     ログイン状態(AuthContext)・トースト通知(ToastContext)
  lib/          Firebase初期化、リアルタイム取得用フック
  styles/       配色トークン（au系ブルーを継承）
```

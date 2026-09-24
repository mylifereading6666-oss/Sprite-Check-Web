# Sprite Check — Supabase setup

このWeb版は、サーバー側の独自コードを書かずにSupabaseをバックエンドとして利用できる構成です。

## 1. Supabaseプロジェクトを作成
Freeプランのプロジェクトを作成します。

## 2. データベースを作成
Supabase DashboardのSQL Editorで、このリポジトリの `supabase-schema.sql` を1回実行します。

## 3. 最初の管理者を設定
Sprite Checkで最初のユーザーを登録したあと、Supabase DashboardのTable Editorで `profiles` のそのユーザーの `role` を `superadmin` に変更します。
以後、管理者機能はRLSで保護されます。

## 4. Web版へ接続
Sprite Checkの「オンライン連携」に、SupabaseのProject URLとPublishable Keyを入力して「Supabase接続」を押します。
Publishable/anonキーをWebに置く方式では、データ保護はRLSが前提です。service_roleキーはWebに入れません。

## 実装済みのWeb機能

- Sprite一覧・画像表示
- シーズン分離
- 所持 / Master / Lv
- 手動編集を優先する画像認識
- Chapter 7 Season 4チェックリストの固定配置認識
- 認識結果の確認後反映
- Sprite公開データの自動更新
- 新着通知
- 検索 / フィルター
- 達成率・統計
- ダーク / ライト
- 日本語 / English
- PWA / オフライン用ローカル保存
- バックアップ / 復元 / リセット
- チェックリスト画像出力
- Supabaseアカウント登録 / ログイン / ログアウト
- ユーザー別Spriteデータ同期
- 最終更新時刻を使ったオフライン復帰時の同期
- Sprite交換募集 / 申請
- ユーザー間チャット
- 問い合わせ
- 管理者ユーザー一覧
- 管理者による一般ユーザーのSprite編集
- 管理者の所持 / Masterチェック編集
- 監査ログ
- 管理者 / Superadmin権限
- RLSによるユーザー間データ分離

## 注意

ブラウザだけで完全なバックグラウンドPushやクライアント改ざん防止を保証することはできません。
この構成では、重要な権限・データ保護はSupabase Auth + RLSでサーバー側に置き、Web側は公開用のPublishable Keyだけを使用します。

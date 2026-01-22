-- ユーザー設定保存用テーブル
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- updated_at を自動更新したい場合は Supabase のトリガーを追加してください

-- Enable Supabase Realtime for all chat message tables
do $$
begin
  alter publication supabase_realtime add table public.exchange_chat_messages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.inquiry_messages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.event_reward_messages;
exception when duplicate_object then null;
end $$;

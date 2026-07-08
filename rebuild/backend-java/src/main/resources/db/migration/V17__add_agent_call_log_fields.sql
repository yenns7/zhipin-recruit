alter table agent_call_logs add column if not exists model varchar(100);
alter table agent_call_logs add column if not exists prompt_tokens int;
alter table agent_call_logs add column if not exists completion_tokens int;

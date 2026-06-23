-- Per-connection chat template / prompt wire format (openai_messages, gemma4, …).
ALTER TABLE provider_connections ADD COLUMN prompt_format TEXT NOT NULL DEFAULT 'openai_messages';

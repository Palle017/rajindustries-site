PRAGMA foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  create_request_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  category TEXT NOT NULL,
  goal TEXT NOT NULL,
  location TEXT NOT NULL,
  timing TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0 CHECK(message_count BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE INDEX threads_updated ON threads(updated_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX threads_expiry ON threads(expires_at, id);
--> statement-breakpoint
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('visitor', 'owner')),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(thread_id, request_id)
);
--> statement-breakpoint
CREATE INDEX messages_thread_cursor ON messages(thread_id, id);
--> statement-breakpoint
CREATE TABLE rate_buckets (
  bucket_key TEXT PRIMARY KEY,
  used INTEGER NOT NULL CHECK(used > 0),
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX rate_buckets_expiry ON rate_buckets(expires_at, bucket_key);

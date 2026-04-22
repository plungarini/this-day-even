CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	even_uid TEXT NOT NULL UNIQUE,
	first_seen_at TEXT NOT NULL,
	last_seen_at TEXT NOT NULL,
	trial_started_at TEXT,
	trial_ends_at TEXT,
	access_status TEXT NOT NULL,
	country TEXT,
	device_count INTEGER NOT NULL DEFAULT 0,
	last_device_sn TEXT,
	request_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS access_grants (
	id TEXT PRIMARY KEY,
	app_user_id TEXT NOT NULL,
	even_uid TEXT NOT NULL,
	source TEXT NOT NULL,
	status TEXT NOT NULL,
	starts_at TEXT NOT NULL,
	ends_at TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	subscription_id TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
	id TEXT PRIMARY KEY,
	app_user_id TEXT NOT NULL,
	even_uid TEXT NOT NULL,
	provider TEXT NOT NULL,
	status TEXT NOT NULL,
	starts_at TEXT NOT NULL,
	ends_at TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	external_customer_id TEXT,
	external_subscription_id TEXT,
	last_payment_event_id TEXT
);

CREATE TABLE IF NOT EXISTS payment_events (
	id TEXT PRIMARY KEY,
	provider TEXT NOT NULL,
	type TEXT NOT NULL,
	received_at TEXT NOT NULL,
	even_uid TEXT,
	app_user_id TEXT,
	external_customer_id TEXT,
	external_subscription_id TEXT,
	payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS request_events (
	id TEXT PRIMARY KEY,
	even_uid TEXT NOT NULL,
	endpoint TEXT NOT NULL,
	result TEXT NOT NULL,
	timestamp TEXT NOT NULL,
	app_version TEXT,
	device_sn TEXT
);

CREATE INDEX IF NOT EXISTS idx_access_grants_even_uid ON access_grants(even_uid, ends_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_even_uid ON subscriptions(even_uid, ends_at);
CREATE INDEX IF NOT EXISTS idx_request_events_even_uid ON request_events(even_uid, timestamp);

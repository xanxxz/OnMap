ALTER TYPE "RoadEventStatus" ADD VALUE IF NOT EXISTS 'HIDDEN_PENDING_REVIEW';

ALTER TABLE road_events
  ADD COLUMN status_before_moderation "RoadEventStatus",
  ADD COLUMN hidden_at TIMESTAMPTZ(3);

CREATE TABLE road_event_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  road_event_id UUID NOT NULL REFERENCES road_events(id) ON DELETE CASCADE,
  reporter_actor_id VARCHAR(128) NOT NULL,
  reason VARCHAR(32) NOT NULL CHECK (reason IN (
    'WRONG_TYPE', 'WRONG_LOCATION', 'DUPLICATE', 'OTHER_ABUSE'
  )),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT road_event_reports_event_actor_key UNIQUE (road_event_id, reporter_actor_id)
);
CREATE INDEX road_event_reports_actor_created_idx
  ON road_event_reports (reporter_actor_id, created_at);

CREATE TABLE road_event_moderation_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  road_event_id UUID NOT NULL UNIQUE REFERENCES road_events(id) ON DELETE CASCADE,
  state VARCHAR(32) NOT NULL DEFAULT 'PENDING_REVIEW',
  decision_at TIMESTAMPTZ(3),
  moderator_telegram_id VARCHAR(64),
  restriction_hours INTEGER CHECK (restriction_hours IN (24, 168, 720)),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);

CREATE TABLE actor_restrictions (
  actor_id VARCHAR(128) PRIMARY KEY,
  blocked_until TIMESTAMPTZ(3) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  created_by_moderator_id VARCHAR(64) NOT NULL,
  reason VARCHAR(32) NOT NULL DEFAULT 'REPORT_REVIEW'
);
CREATE INDEX actor_restrictions_blocked_until_idx
  ON actor_restrictions (blocked_until);

CREATE TABLE road_event_author_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  road_event_id UUID NOT NULL REFERENCES road_events(id) ON DELETE CASCADE,
  actor_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ(3),
  CONSTRAINT road_event_author_notices_event_actor_key UNIQUE (road_event_id, actor_id)
);
CREATE INDEX road_event_author_notices_actor_idx
  ON road_event_author_notices (actor_id, acknowledged_at, created_at);

CREATE TABLE telegram_moderation_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  road_event_id UUID NOT NULL UNIQUE REFERENCES road_events(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'SENT')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ(3),
  sent_at TIMESTAMPTZ(3),
  telegram_message_id VARCHAR(64),
  last_error_code VARCHAR(64),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX telegram_moderation_outbox_pending_idx
  ON telegram_moderation_outbox (status, next_attempt_at);

CREATE TABLE telegram_moderation_updates (
  update_id BIGINT PRIMARY KEY,
  processed_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);

CREATE TABLE road_event_moderation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  road_event_id UUID NOT NULL REFERENCES road_events(id) ON DELETE CASCADE,
  moderator_telegram_id VARCHAR(64) NOT NULL,
  decision VARCHAR(32) NOT NULL CHECK (decision IN ('RESTORED', 'AUTHOR_RESTRICTED', 'EXPIRED')),
  restriction_hours INTEGER CHECK (restriction_hours IN (24, 168, 720)),
  telegram_update_id BIGINT UNIQUE,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX road_event_moderation_audit_event_idx
  ON road_event_moderation_audit (road_event_id, created_at);

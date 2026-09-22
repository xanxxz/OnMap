CREATE TABLE "telegram_source_cursors" (
    "city_id" VARCHAR(64) NOT NULL,
    "source_chat_id" VARCHAR(64) NOT NULL,
    "last_message_id" BIGINT NOT NULL,
    "last_message_timestamp" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_source_cursors_pkey" PRIMARY KEY ("city_id", "source_chat_id")
);

CREATE TABLE "partner_image_assets" (
  "key" UUID NOT NULL,
  "png_bytes" BYTEA NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_image_assets_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "partner_image_assets_png_nonempty" CHECK (octet_length("png_bytes") > 0)
);

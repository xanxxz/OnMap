ALTER TABLE "partner_points"
    ADD COLUMN "background_color" VARCHAR(7) NOT NULL DEFAULT '#153D32',
    ADD COLUMN "text_color" VARCHAR(7) NOT NULL DEFAULT '#FDFBF4';

ALTER TABLE "partner_points"
    ADD CONSTRAINT "partner_points_background_color_check"
        CHECK ("background_color" ~ '^#[0-9A-F]{6}$'),
    ADD CONSTRAINT "partner_points_text_color_check"
        CHECK ("text_color" ~ '^#[0-9A-F]{6}$');

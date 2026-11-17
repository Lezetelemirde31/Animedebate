-- Localized notifications: store the values, build the text in the reader's language.
ALTER TABLE "Notification" ADD COLUMN "params" JSONB;

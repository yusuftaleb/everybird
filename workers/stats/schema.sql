-- Everybird anonymous events: one row per event, day-level only.
CREATE TABLE IF NOT EXISTS events (
  day TEXT NOT NULL,      -- YYYY-MM-DD (UTC)
  name TEXT NOT NULL,     -- visit | collage_made | image_downloaded | shared | link_copied
  value TEXT NOT NULL,    -- the one allowed property value
  country TEXT NOT NULL,  -- ISO 3166-1 alpha-2 from Cloudflare, XX if unknown
  device TEXT NOT NULL,   -- iphone | ipad | android-phone | android-tablet | other-tablet | other-phone | mac | windows | linux | chromeos | other
  vid TEXT NOT NULL DEFAULT '' -- anonymous visitor id, rotates daily (HMAC of day; hash of IP+UA, neither stored)
);
CREATE INDEX IF NOT EXISTS events_day_name ON events (day, name);
CREATE INDEX IF NOT EXISTS events_day_vid ON events (day, vid);

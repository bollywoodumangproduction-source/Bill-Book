-- Separate B2B Production/Lab terms from B2C Films terms.
ALTER TABLE studio_settings
  ADD COLUMN IF NOT EXISTS production_terms text DEFAULT '';

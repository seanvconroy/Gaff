-- BA-14: a home's address as search reads it, so a search can match places in SQL. The twin of
-- `normalise` (src/domain/places/normalise.ts) and `addressWordsOf` (src/domain/search/places.ts):
-- a test holds them to the same words. Immutable, so Postgres keeps the column itself.
CREATE FUNCTION gaff_normalise(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(
    replace(
      regexp_replace(
        lower(regexp_replace(normalize(coalesce(value, ''), NFD), '[̀-ͯ]', '', 'g')),
        '[''’‘`]', '', 'g'),
      '&', ' and '),
    '[^abcdefghijklmnopqrstuvwxyz0123456789]+', ' ', 'g'))
$$;
--> statement-breakpoint
CREATE FUNCTION gaff_address_words(line1 text, line2 text, area text) RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE
  part text;
  words text[];
  result text[] := '{}';
  n int;
  i int;
  word text;
BEGIN
  FOREACH part IN ARRAY string_to_array(
    coalesce(line1, '') || ',' || coalesce(line2, '') || ',' || coalesce(area, ''), ','
  ) LOOP
    -- "County Sligo" is Sligo; "Co. Dublin" is Dublin.
    part := regexp_replace(gaff_normalise(part), '^(county|co) (?=\S)', '');
    IF part = '' THEN CONTINUE; END IF;
    words := string_to_array(part, ' ');
    n := cardinality(words);
    FOR i IN 1..n LOOP
      word := words[i];
      IF word = '' THEN CONTINUE; END IF;
      -- "St" is a street at the end of a part, and a saint anywhere else.
      word := CASE word
        WHEN 'st' THEN CASE WHEN i = n THEN 'street' ELSE 'saint' END
        WHEN 'rd' THEN 'road'
        WHEN 'ave' THEN 'avenue'
        WHEN 'av' THEN 'avenue'
        WHEN 'pk' THEN 'park'
        WHEN 'sq' THEN 'square'
        WHEN 'tce' THEN 'terrace'
        WHEN 'ter' THEN 'terrace'
        WHEN 'cres' THEN 'crescent'
        WHEN 'cl' THEN 'close'
        WHEN 'ct' THEN 'court'
        WHEN 'dr' THEN 'drive'
        WHEN 'gro' THEN 'grove'
        WHEN 'gdns' THEN 'gardens'
        WHEN 'hts' THEN 'heights'
        WHEN 'pl' THEN 'place'
        WHEN 'lr' THEN 'lower'
        WHEN 'lwr' THEN 'lower'
        WHEN 'upr' THEN 'upper'
        WHEN 'up' THEN 'upper'
        WHEN 'nth' THEN 'north'
        WHEN 'sth' THEN 'south'
        WHEN 'mt' THEN 'mount'
        WHEN 'hosp' THEN 'hospital'
        WHEN 'stn' THEN 'station'
        WHEN 'uni' THEN 'university'
        ELSE word
      END;
      result := result || word;
    END LOOP;
  END LOOP;
  RETURN array_to_string(result, ' ');
END;
$$;
--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "address_words" text GENERATED ALWAYS AS (gaff_address_words("address_line1", "address_line2", "area")) STORED;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "more_facts" jsonb;--> statement-breakpoint
ALTER TABLE "lettings" ADD COLUMN "enquiries_close_at" timestamp with time zone;

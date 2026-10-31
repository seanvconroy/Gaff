-- ADR-0006: the event log is append-only. Updates and deletes are refused, except inside a
-- deliberate maintenance procedure that sets app.allow_event_purge (e.g. deleting an
-- organisation's data at the end of its contract).
CREATE FUNCTION events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_event_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'events are append-only (ADR-0006)';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER events_append_only
BEFORE UPDATE OR DELETE ON events
FOR EACH ROW EXECUTE FUNCTION events_append_only();

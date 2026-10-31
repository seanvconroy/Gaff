-- Local development database. The app role is not a superuser and can't bypass RLS (ADR-0004).
CREATE ROLE gaff LOGIN PASSWORD 'gaff' NOSUPERUSER CREATEDB NOBYPASSRLS;
CREATE DATABASE gaff_dev OWNER gaff;

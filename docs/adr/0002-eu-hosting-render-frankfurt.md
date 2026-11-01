# ADR-0002: EU hosting on Render, Frankfurt

- Status: Superseded by [ADR-0014](0014-vercel-supabase-approved-vendors.md) on 1 November 2026. Accepted by the CTO on 31 October 2026.
- Date: 2026-10-31

## Context

The PRD requires data hosted in the EU, encrypted in transit and at rest, with role-based access. Neither founder should have to run servers, patch operating systems or set up networks.

## Decision

Host on **Render in its Frankfurt region**:

- a web service and a background worker, both from the same Docker image;
- managed PostgreSQL in Frankfurt, on a paid plan so point-in-time recovery is on (7 days on Pro);
- private networking between them, and TLS for all traffic;
- secrets in Render environment groups, never in the repo;
- infrastructure described in `render.yaml` in the repo, with separate staging and production environments.

Check before signing: Render's DPA and sub-processor list, that backups stay in the EU, and encryption at rest for database volumes and backups.

## Consequences

- One vendor, one bill and one dashboard for the app and the database. No Kubernetes, VPCs or servers to manage.
- Frankfurt, not Dublin. The PRD asks for the EU, so this is enough, and latency from Ireland is small.
- Render is a US company. The DPIA covers the transfer safeguards (standard contractual clauses or the EU-US Data Privacy Framework).
- Gaff is a Docker image plus Postgres, so moving host later is a few days' work, not a rewrite.

## Alternatives considered

- **AWS, Ireland (eu-west-1).** Data in Dublin and the most control, but far more to operate (VPC, ECS, RDS, IAM). Worth revisiting once there's a full-time engineer.
- **Fly.io (Frankfurt or Amsterdam).** Comparable, and it now has managed Postgres, but it's more hands-on.
- **Scaleway or Clever Cloud.** EU-owned, which avoids US jurisdiction entirely, but less mature tooling.
- **Vercel plus Neon.** Both have EU regions, but background jobs would need another vendor.

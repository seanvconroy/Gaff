# ADR-0021: The photo pipeline

- Status: Accepted
- Date: 2026-11-07

## Context

Listings need many photos (M43), served fast to renters' phones, with no location or camera details, and a way to spot photos taken from another letter's listing (M29). Vercel functions take at most 4.5 MB per request, and photos are public.

## Decision

- **Uploads go straight to storage.** Gaff checks the declared type and size, then gives the browser a short-lived signed URL for one object in a private `uploads` bucket. No photo passes through a Vercel function. The browser first redraws each photo upright, at most 2,560 px, as a JPEG.
- **A job cleans every photo** (`media.process`, sharp): the real type from the bytes (JPEG, PNG or WebP), a size and pixel limit, turned upright, all metadata removed, fixed WebP widths (480, 960, 1,440, 2,048) and a 1,200 px JPEG for link previews, written to the public `listing-photos` bucket under the photo's random ID. The original is deleted, whatever the outcome.
- **A 64-bit difference hash** of each photo is kept. A close match in another organisation's photos holds a listing for review (M29); the comparison runs as a system job and returns only a yes or no.
- **Storage is a port**: Supabase Storage (an approved vendor) in production, files on disk locally. The CSP allows only Gaff and the storage origin.
- A published listing's public copy is refreshed when a new photo finishes processing (M51).

## Consequences

- Predictable cost, and no per-transformation billing.
- Photos appear a few seconds after upload, not instantly; the editor says so.
- Browsers that can't read HEIC upload the original, which the server refuses; a WebAssembly decoder is the planned fix (tech spec, risks).

## Alternatives considered

- **Uploading through a server action.** Hits Vercel's request limit, and costs function time.
- **Resizing on the fly (Vercel or Supabase image transformation).** Simpler, but billed per transformation, and the original, with its metadata, would stay stored.

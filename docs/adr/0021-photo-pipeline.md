# ADR-0021: The photo pipeline

- Status: Accepted
- Date: 2026-11-19
- Brought across from the live line's ADR-0021 (M43, M44), fitted to the redesign's photo store (UX-LT-10).

## Context

A home's photos are shown to renters on phones, on the home's page, in search and in the lister's own screens. They must carry no location or camera details, come out the right way up, load at the size each page needs, and leave a way to spot a photo taken from another home's page (M29). The redesign kept each photo as one cleaned file, stripped byte by byte. Vercel functions take at most 4.5 MB per request.

## Decision

- **Every photo is made again from its pixels** (`src/server/lettings/photo-pipeline.ts`, sharp 0.34.4): its real type from its bytes (JPEG, PNG or WebP; HEIC is known and answered plainly), a pixel limit before decoding, at least 400 px on its longest side, turned upright, all metadata dropped, sRGB. It is kept as WebP at the fixed widths it reaches (480, 960, 1,440, 2,048) and as a 1,200 px JPEG for link previews, in a folder named by the organisation's and the photo's IDs (`photoFolder`). The file that came in is never kept.
- **This happens while the photo uploads**, not in a background job, so the uploader's tile shows the result or the reason, as the redesign's screens expect.
- **Pages ask for the size they need**: `photoSources` gives a `src` at the width wanted (960 on a page, 480 for a cover in a list) and a `srcset` of every size kept.
- **A 64-bit difference hash** of each photo is kept (`letting_photos.phash`). The check that uses it (M29) is a later package: `looksLikeTheSamePhoto` is its seam.
- **Floor plans** (M44) are pictures of kind `floor_plan`: added like a photo, marked from its menu, always after the photos, never the cover, shown whole.
- **Two ways in.** With the local store (development, tests, the test copy) a photo goes through a server action, redrawn in the browser to at most 2,560 px so it stays under 4 MB. With Supabase Storage the browser sends it straight to the private bucket under `uploads/` with a signed address (`startPhotoUpload`), and Gaff reads it back, cleans it and deletes the original whatever the outcome (`finishPhotoUpload`). The nightly job deletes originals never finished after a day. The content policy's `connect-src` names the store's origin only then.
- Photos are still served from Gaff's own address (`/media/...`); the bucket stays private.

## Consequences

- No per-transformation billing, and no original with its metadata is ever stored for longer than its upload.
- A photo kept before the pipeline (one file, `widths` empty) is still served as it is.
- A HEIC file needs a browser that can open it (Safari, and every iPhone, which converts on upload). sharp's own build reads no HEVC, so elsewhere the lister is told to add it from their phone or save it as a JPEG. A decoder would be a new dependency.
- Each upload takes a second or so more of function time.

## Alternatives considered

- **A background job, as on the live line.** Keeps requests short, but the tile would need to poll or the page to be refreshed.
- **Resizing on the fly (Vercel or Supabase image transformation).** Billed per transformation, and the original, with its metadata, would stay stored.

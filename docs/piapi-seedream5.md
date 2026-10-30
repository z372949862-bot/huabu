# PiAPI Seedream 5 Pro Less Restriction

Implemented against https://piapi.ai/docs/seedream-api/seedream-5.md, checked 2026-10-30.

## In the application

- Add/select image provider **PiAPI · Seedream 5 Pro** and model **seedream-5-pro-less-restriction**. Existing PiAPI video credentials are copied locally during migration 17 when the base URL is the official endpoint. Existing image defaults are preserved.
- Text-to-image and reference-image editing share the image node. Supports 1K/2K, ten documented aspect ratios, JPEG/PNG, up to ten reference images and one generated image per request.
- Local image references use the existing official temporary uploader (Creator or higher; Base64 payload at most 10 MB, roughly 7.5 MB original). Public image links can be used without that uploader. No unrelated hosting service is selected automatically.
- This image API documents public image URLs. Seedance private asset IDs and its video-specific parameters are not sent to Seedream.

## API contract

POST https://api.piapi.ai/api/v1/task with X-API-Key. Body model=seedream, task_type=seedream-5-pro-less-restriction; input has prompt, size, aspect_ratio, output_format and optional image_urls.

The prose mentions WebP output, but the OpenAPI enum lists jpeg/png. The UI conservatively exposes JPEG and PNG; downloading WebP results is still supported. Lite-only batch flags, seed and negative prompt are omitted.

Normally the response contains the synchronous image result. The documented pending/task_id example is also handled by polling GET /api/v1/task/{task_id}. Singular image_url and plural image_urls are supported. Error reasons are shown from the provider.

## Recovery and storage

- Never automatically repeat the paid POST. A returned task ID is persisted before downloading, including if local waiting was cancelled during the request. Duplicate clicks stay locked until that POST returns.
- Failed downloads or interrupted polling retain the task. **继续查询上次任务** resumes GET only; it does not re-upload references or create a new task. Confirmed terminal task failure clears the pending ID.
- If a POST response is lost before its task ID arrives, check PiAPI task history before manually submitting again. The software cannot infer an ID that it never received.
- Download images to userData/generated-images/piapi, check file signatures and transfer size, cache by account/task/URL, and populate the existing node/history after successful saving. Credentials are not forwarded to third-party CDN redirects.
- A response arriving after switching projects is retained against the original project. Copying a node does not copy its pending task.

## Verification

Mocked tests cover protocol fields, reference ordering/limits, direct completion, queued fallback, failure/cancellation, duplicate submission protection, disk recovery, project switching, migration, local download and credential isolation. No paid production generation was submitted during development.

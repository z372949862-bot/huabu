# IDEA Gates Seedance 2.5 / 720p

Source: user-supplied “Seedance 视频生成 API 文档”, updated 2026-11-10, https://ideagates.com/custom/025caa3521c3a4d3.

## Supported scope

| Settings entry | API model | Resolution |
|---|---|---|
| IDEA Gates · Seedance NSFW 可溯源 | `doubao-seedance-2-5-260628` | 720p |
| IDEA Gates · 海外-NSFW 视频 8.5 折 | `dreamina-seedance-2-5` | 720p |

Each entry has its own API Key. Actual routing/group is determined by the Key; selecting the entry cannot change its server-side group. `/models` verifies the selected model and 720p capability, but cannot distinguish domestic groups sharing that model ID. The owner must select the requested group when creating the Key on IDEA Gates.

## Using the app

1. Open 设置 → 视频中转站; the two entries are added on migration, with empty Keys.
2. Enter the matching Key into each entry and test the connection. Tests only GET `/v1/models`; no paid generation.
3. Select the provider on a video node. The catalog exposes one model at 720p, 4–30 seconds.
4. Use the + picker for local images, videos or audio (up to 100 MB each), or add HTTPS links / existing `asset://` IDs. On Generate, local bytes are staged at `imageproxy.zhongzhuan.chat` without the API Key, registered via IDEA Gates `/asset/groups` and `/asset/create`, and polled with `/asset/get` until Active and the type matches. Only then is a video task submitted. Overseas asset-library availability depends on the actual Key.
5. First-frame and first/last-frame modes require exactly one/two images, without additional reference images, video or audio. Editing sends `duration=-1, ratio=adaptive`; extending sends total output seconds and `ratio=adaptive`.

## Task and result handling

- Asset registration persists exact request bodies and idempotency keys under `ideagates-assets/`, isolated by Key fingerprint and selected group. Same bytes reuse their registered ID across restarts; ambiguous registrations reuse the same body/key. Confirmed terminal/missing local assets are re-registered on retry, after checking group existence; only a confirmed missing group resets its registration. Auth/transient errors do not discard records. The API permits same-user/same-group sharing; existing IDs may be entered with another eligible Key and are validated by the server.
- Canceling preparation stops the video submission; an in-flight staging/registration may finish and is retained for reuse. Registration failures never fall back to a paid video submission. No remote asset deletion is performed.

- Requests use Electron's network bridge and `Authorization: Bearer ...` at `https://ideagates.com/v1`.
- Capability validation precedes the one-time task POST. Network/5xx uncertainty does not automatically resubmit. A persisted uncertainty marker blocks another POST until the user reconciles with the platform and enters the task ID or confirms none was created.
- The task record pins its provider and a SHA-256 key fingerprint. Resume requires the original Key; raw credentials are not copied into task records.
- Queries run every 10 seconds with backoff and `Retry-After`. Stop cancels only local polling, not the remote billable task. Tasks survive restarts and project switching.
- Success downloads the full signed URL without an API Key, including redirects. A task remains recoverable until download succeeds.
- Full request/response records and MP4 files are saved under the app's user data directory, `ideagates-tasks/`. Node metadata preserves the full result, including `doubao-id` / `cgt_id`, `usage`, and `content.last_frame_url`. Signed URLs remain private; response errors shown to the user redact query strings and Keys.
- No cancellation or deletion request is sent. `cancelled` / `expired` retain the task for reconciliation.

## Validation

The tests use simulated provider responses; they never submit billable requests. Coverage includes model/group restrictions, 720p validation, explicit false and edit -1, frame roles, capability checks, submission uncertainty, late responses after cancellation, durable task recovery, key mismatch, retry timing, signed downloads and metadata persistence.

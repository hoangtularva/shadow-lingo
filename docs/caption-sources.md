# Caption sources — spike results (2026-11-22)

Tested in a real Chromium page on a TED talk with 50 caption tracks (manual en, asr en, manual vi…).

| Approach                                                                     | Result                                                                                                                     | Use                            |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Fetch `captionTracks[].baseUrl` directly (`fmt=json3`)                       | HTTP 200, **empty body**. Caption requests now need a PO token issued by the player.                                       | Not used                       |
| Read the player's own `/api/timedtext` response (XHR, MAIN world, read-only) | Works: full json3 body. Only happens when captions are on. The first response may belong to a pre-roll ad (different `v`). | **Primary**                    |
| Innertube `get_transcript`                                                   | Not tested.                                                                                                                | Candidate fallback later       |
| User pastes transcript / opens .srt or .vtt                                  | Always works, no network.                                                                                                  | **Fallback, always available** |

## Rules that follow

- Never build, copy or reuse tokens across requests. Only observe responses the player already requested.
- Accept a captured response only if its `v` equals the current videoId; keep the latest response per `lang` + `kind`.
- Preferred track: manual English → asr English. If the player is showing another language, ask the user to switch captions to English (panel button may call the player's caption option on user click).
- Captions stay in memory for the current video only; nothing is stored or sent.

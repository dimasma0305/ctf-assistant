# Creator follow-up DM regression (2026-10-23)

The frozen scenario reproduces a creator-authored Joints UGM Finals participant list,
an existing deadline reminder, .effie's later `okayy`, and the creator's follow-up:
`@Hackerika kasih mereka dm kecuali yang sudah confirm disini ya`.
The desired effect is one DM each to Marc and merrow, no DM to Dimas or .effie,
no new reminder, and no misassigned role in either DM.

| Runtime | Correct trials | Observed behavior |
| --- | ---: | --- |
| Deployed `ctf-assistant:a464763` | 0/2 | Tool rejected recipients from the earlier list; no DMs. |
| Final candidate based on `a464763` | 2/2 | Marc and merrow each received one simulated DM; Dimas and .effie received none. |

Both variants ran the same case through the real chat handler and model, with fake Discord
channels, members, DMs, and database. The candidate's shared message asked for confirmation
without assigning Marc's role to merrow or soliciting unrelated vacant roles. One failed
intermediate candidate exposed a `listMessageId` path that bypassed confirmation review;
the final implementation reviews replies for direct, replied-to, and recent lists.

The two trials are a targeted regression check, not a production success-rate estimate.
No real Discord message or DM was sent by the benchmark. The case and deterministic grader
remain in `cases.ts` and `grader.ts`; the raw synthetic results and run protocols are in
`runs/creator-contact-baseline-20261023` and
`runs/creator-contact-candidate-20261023`.

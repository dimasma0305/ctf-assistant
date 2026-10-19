# OSINT CTF framework cheatsheet

Use this when a challenge spans several pages, snapshots, identities, images, or dates. Keep challenge-specific names, URLs, screenshots, candidate flags, and rejected answers in the challenge workspace.

## 1. Lock the player contract

| Question | Record before searching |
| --- | --- |
| What must be answered? | Exact entity, relationship, event, location, time window, and flag format stated by the platform. |
| What is the assigned evidence? | Supplied artifacts and live instance identity. Check that its subject and questions match the platform prompt before investing in analysis. |
| What is allowed? | Public sources, archives, authenticated challenge surfaces, interaction limits, and whether public writeups may be used. |
| What proves completion? | Player-visible flag, instance validator, platform acceptance, or only a supported factual answer. Keep those levels separate. |

If the assigned instance presents a different case, verify the host and challenge assignment once, preserve both prompts, and mark the platform task blocked until a matching source is available. An unrelated service cannot establish the requested answer.

## 2. Make an evidence matrix

| Claim | Exact observable | Source and URL/artifact | Event date | Capture or publication date | Independent check | Alternative explanation | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| One factual proposition per row | Quote a short decisive phrase, image feature, metadata field, or record value | Save path, URL, and access time | When the described event occurred, if known | When the source was archived or published | A separate origin when needed | What else could fit? | `OBSERVED`, `INFERRED`, or `HYPOTHESIS` |

An archive capture date proves that content was visible by that capture. It does not by itself date the underlying employment, ownership, event, or edit. Save the source URL, capture identifier, UTC access time, and a local digest when the source may change. Avoid copying private challenge material into public search queries or third-party analyzers.

## 3. Search by evidence gap

| Evidence type | First discriminating action | Common false inference |
| --- | --- | --- |
| Website history | Compare earliest and latest relevant captures; note text added, removed, or rewritten; inspect linked pages only if they function. | A changed biography alone proves motive or payment. |
| Person or organization | Resolve aliases with a direct account link or other specific identifier; use [person OSINT](person-osint.md) for edge provenance, namesakes, and publisher credits. | Same name means same person; prior employment means current direction by that company. |
| Image or video | Preserve original pixels and metadata, isolate visible landmarks or equipment features, then compare to an authoritative source image. | Image host is the depicted location or manufacturer. |
| Place and time | Test map geometry, signage, shadows, weather, and dated imagery as separate constraints. | One matching landmark fixes an exact date or coordinate. |
| Document or domain | Preserve version and record type; compare registry, DNS, document author, and archived content on their own time axes. | Administrative contact is beneficial owner or campaign organizer. |

Search for the next missing link, not the full challenge answer. A snippet or reverse-image match is a lead; open the originating record. After repeated searches produce no new source fact, inspect the best existing source or run a discriminating local comparison before searching again.

## 4. Calibrate the conclusion

Build the shortest chain from a direct observation to the requested claim. Prior affiliation plus later criticism may support a conflict-of-interest concern. It does not, without more evidence, establish direction, funding, coordination, falsity, or a particular executive's approval. Name the first missing link and seek a source that can decide it.

For identity, ownership, and precise geolocation, use an independent origin when the stakes or challenge wording demand it. Two pages repeating the same press release are one origin. Mark inferred links as such; do not promote a plausible narrative to an observed fact.

## 5. Gate the flag

1. Confirm the answer fields from the evidence matrix and check the platform's required order, case, separators, and examples.
2. Look for an explicit flag string or answer format in permitted player inputs. A factual answer does not determine an unstated encoding.
3. If exact-title research or a public writeup supplies the missing syntax and the rules allow it, label the run `writeup-assisted`; keep the source and first exposure time. Never call that result blind.
4. Submit only an evidence-backed candidate when authorized. Verify the platform's acceptance state separately from a format match or local app success.
5. Record the highest proof and any blocker. Do not manufacture a flag from a likely phrase, source comment, unrelated instance, or accepted answer to an earlier question.

## Minimal handoff

`Target and access mode → strongest observed facts → source/time matrix → rejected alternatives → highest proof → exact next discriminating test → blocker or accepted result.`

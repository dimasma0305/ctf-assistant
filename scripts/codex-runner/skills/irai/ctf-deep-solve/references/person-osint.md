# Person OSINT: public identity links

Use this when a CTF asks who controls a profile, how a public professional identity connects across sites, or whether an attributed publication belongs to the same person. Keep case-specific names and URLs in the challenge evidence matrix, not in this reusable reference.

## Resolve identity before biography

1. Start from a challenge-supplied identifier or one user-confirmed public account. Record its canonical URL and the exact claim the account makes.
2. Open outbound links on that account and record the destination URL after redirects. A direct profile link is a strong edge for a *claimed association* between accounts. A reciprocal link is stronger. A matching display name, avatar, username fragment, location, or search snippet alone is a lead.
3. For a third-party credit, inspect the publisher's record and its outbound link to the anchored account. Attribute only the specific work the publisher credits; do not transfer every self-described achievement to independent fact.
4. Search for plausible namesakes and compare the identifiers. Leave them as separate nodes unless a specific direct edge connects them. Conflicting jobs or cities are disambiguation clues, not proof of a different person by themselves.
5. Date each edge by the time observed or captured. A current link does not prove it existed when an older event occurred.

## Deepen a public professional footprint

When the task asks for more than account attribution, turn the requested claims into separate source questions. Search each claim's natural record keeper before widening name searches:

| Claim to test | Specific pivot | Limit of that record |
| --- | --- | --- |
| Created a project or challenge | Project or competition organizer's repository, release, challenge index, or credited commit | A username credit proves the listed contribution; it does not prove every claimed role or team membership. |
| Reported a vulnerability | Publisher advisory and researcher record, then vendor notice or CVE record if attribution is relevant | An index copying the publisher is a derivative origin. Counts may differ by snapshot, inclusion rule, or update time. |
| Spoke at an event | Organizer's program or speaker page, then post-event recording, slides, or recap | A speaker listing supports being scheduled; it alone does not prove delivery or attendance. |
| Belongs to a team or organization | Organization roster, repository membership, or dated competition credit | Current membership cannot be projected backward to every event. |

Use exact handles, project titles, advisory IDs, and event names as pivots; keep a query log of what each search was meant to decide. Inspect the original record behind snippets and aggregators. Search alternate spellings only after specific identifiers stall. For each new result, ask whether it adds a new origin, a new time point, or a new claim; otherwise stop repeating the query family and inspect the best source already found.

When the research run has a Codex JSONL trace and a JSON answer, check citation coverage before accepting its `OBSERVED` credits: `python scripts/audit_web_research.py <trace.jsonl> --claims-json <answer.json> --require-all-claims-opened`. A single open action may return several pages; judge each successful result separately, and treat an access error as uninspected. Open each flagged exact page and inspect its attribution, or downgrade that credit to an unverified lead. The checker verifies page-open provenance only; still read the page body and test identity linkage yourself. Do not count a failed check as a verified discovery.

Treat a blocked page as uninspected. An inbound link can still support a claimed association, but cannot establish reciprocal content. When public counts conflict, retain each count with its source and access date; do not average or silently select one. If an event date has passed, seek post-event proof before changing `listed` to `participated`.

## Search the long tail when depth is requested

After the obvious profiles are mapped, search confirmed handles and exact project titles across writing platforms, organizer repositories, software registries, vendor changelogs, and archived versions of known domains. Use quoted identifiers and exclude the already reviewed profile sites to surface new origins. Inspect a result's outbound link back to the anchor; a matching handle or name without that edge stays unresolved.

Compare an archive snapshot with the current page to identify historical *self-claims* or removed links. Record capture time and original URL; do not treat an old claim as independently verified or current. For a package or plugin credit, prefer the maintainer's original release note or project page over mirrors and indexes, and limit the conclusion to the credited contribution.

Treat third-party copies of a profile as copies, not evidence of employment, education, or account control on the copying domain. Record their existence only if the task asks about search visibility or impersonation. For adverse claims, inspect the exact allegation and its cited primary evidence, distinguish a visible allegation from an established finding, and report source-access or authenticity limits. Do not endorse or suppress criticism based only on tone. Never bypass authentication or use leaked private data to deepen a person search.

Track each search family's new original sources and stop expanding it after repeated results add only copies, snippets, or the same claim. Move to a different source class or report the remaining gap.

## Record an evidence graph

| From node | Edge and exact observable | To node | Source class | Time | Status |
| --- | --- | --- | --- | --- | --- |
| Profile A | Outbound hyperlink to canonical URL B | Profile B | Self-published | Access or archive time | `OBSERVED` association; owner control remains `INFERRED` |
| Publisher record C | Credits A and links to A's profile | Profile A | Publisher-origin | Publication and access time | `OBSERVED` credit |
| Search hit D | Matching display name only | Profile A | Search index | Access time | `HYPOTHESIS`; do not merge |

Preserve the source URL, link target, short decisive text, UTC access time, and a snapshot or digest if the page may change. Count origins, not pages: a portfolio repeating its GitHub bio is one self-published account family. Report confidence per **edge**, rather than assigning one confidence label to the whole person.

## Deliver and stop

Return a map of verified public professional profiles and the exact edge supporting each connection. If the task requests depth, add claim-specific original records, alternate explanations, and the first missing link for uncertain associations. Distinguish self-description, organizer records, publisher credit, and derivative indexes. Stop when the requested claims have been tested or new searches cease adding distinct evidence; do not expand into private contact details, relatives, home addresses, breached data, or direct contact with the person.

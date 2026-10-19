# Research and tooling

Use this reference for public research, Notion retrieval, downloads, or interactive tools.

## Preserve the evaluation contract

Honor the event rules and the user's stated research policy. Generic public research, upstream documentation, and tool documentation are normally compatible with a research-enabled solve. Searching the exact challenge title, flag, distinctive source strings, or public writeups can expose the answer and may violate live-event rules or invalidate a blind benchmark.

Use this query ladder and stop when the hypothesis is resolved:

1. Exact error/API/tool/version.
2. Technology plus suspected mechanism or parser behavior.
3. Upstream source, changelog, advisory, issue, specification, or paper.
4. Exact challenge/writeup search only when allowed.

Record decisive URLs and what they establish. A search result snippet is a lead; open the original source. Do not paste private challenge source, credentials, unpublished titles, flags, or unique secrets into public search services.

Batch materially different discovery queries when the tool supports it. After
two consecutive search batches produce no new primary-source observation or
local test result, inspect the strongest existing source or run the cheapest
discriminating experiment. Resume searching only for a named remaining gap
using a term learned from that inspection or experiment.

When exact-solution research is allowed, still solve through the supplied target and produce a working local solver. Label the run `writeup-assisted`; do not present it as independent discovery. For AI-resistance evaluation, preserve `blind`, `generic-research`, `source-assisted`, `writeup-assisted`, and `author-assisted` as distinct access modes.

## Use in-scope prior notes

When prior notes are allowed by the task's access mode, search for category,
language/framework, protection, primitive, tool, parser, and distinctive error
terms. Fetch the target page and relevant surrounding caveats. Reuse techniques
and tooling knowledge, but revalidate versions and environmental assumptions
against the current challenge. Skip this step for a blind solve.

Prior-note summaries can point to evidence without containing it. A local path
in a note is not inspected evidence unless it is accessible and opened. Record
when a note exposed the exact challenge or intended path because that changes
the access mode.

## Compare exact dependency behavior first

When a manifest or lockfile pins a dependency implicated by the leading
hypothesis, inspect the bundled release before broad searching. Obtain the
nearest relevant fixed release from the official repository or registry and
diff only the component, tests, or changelog entry tied to the suspected
behavior. Convert the difference into a small experiment against the pinned
version and application data flow. An upstream fix identifies a candidate
behavior; it does not prove reachability or a working exploit in the challenge.

## Acquire third-party tools deliberately

Prefer a tool already present in the project or environment when it answers the question. Otherwise obtain it from the official project or package registry and record:

- release or commit and source URL;
- platform/architecture and dependency requirements;
- published checksum/signature when available;
- installed command/version and any plugins;
- license when redistributing artifacts.

Install Python and JavaScript dependencies in the challenge's isolated environment using its package manager and lockfile. Keep downloaded binaries, caches, databases, and large tool output out of source control. Inspect install instructions and manifests before execution; avoid remote installer pipelines. Do not give a downloaded tool credentials or unrelated filesystem access.

Test the tool on a known small input before trusting its challenge output. Where correctness matters, compare two implementations or verify an invariant. Tool success means the command ran; it does not establish that the interpretation is correct.

Useful tool classes include:

| Category | Tool classes |
| --- | --- |
| Web/browser | exact HTTP clients, proxy/history inspection, browser automation, source maps, local service harnesses |
| Pwn | file/checksec utilities, debugger, disassembler/decompiler, ROP helpers, syscall tracers, pwntools-style scripting |
| Crypto | exact arithmetic, CAS, SAT/SMT, lattice tools, symbolic algebra, packet/oracle scripts |
| Reversing | decompiler/disassembler, debugger, emulator, binary parser, instrumentation, language/runtime-specific tooling |
| Forensics | filesystem and metadata parsers, packet analyzers, memory frameworks, archive/document parsers, carving tools |
| Misc | grammar/protocol tools, constraint solvers, image/audio analyzers, custom parsers |

Choose based on the next hypothesis rather than installing an entire toolbox.

## Interactive sessions and evidence

Keep a PTY session alive for debuggers, network clients, REPLs, and long-running services. Use explicit timeouts and bounded polling. Preserve the minimum transcript that establishes the observation, including command, relevant output, exit status, and environment.

Reduce huge output before loading it into the reasoning context. Save raw output to evidence files, then extract addresses, strings, call sites, packet fields, constraints, or errors with precise references. Never summarize output that was not actually observed.

Target instability is evidence to classify. Distinguish exploit failure, network failure, service reset, rate limiting, and environment mismatch. Retry only when a new observation or changed condition justifies it.

## Research basis

The workflow uses findings from primary CTF-agent research:

- [EnIGMA](https://arxiv.org/abs/2409.16165) showed the value of interactive debugger and network interfaces and documented agents inventing observations instead of using tools.
- [InterCode-CTF](https://openreview.net/pdf?id=KOZwk7BFc3) found greater difficulty on challenges requiring multiple investigative steps and specialized skills.
- [CTFusion](https://arxiv.org/abs/2605.11504) documents contamination and answer exposure from web search, motivating explicit access-mode labeling.
- [Dynamic Risk Assessments for Offensive Cybersecurity Agents](https://openreview.net/pdf/0b4f8fde63f10eb73a14661341122e11281a87f0.pdf) reports diminishing returns, repetitive loops, and context limitations as interaction counts grow, motivating checkpoints and evidence-changing pivots.

These sources motivate decisions; they do not prove that this skill outperforms a human or another agent without a matched evaluation.

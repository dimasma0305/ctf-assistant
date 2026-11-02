---
name: meme-craft
description: Create or revise memes using existing image templates and short, context-aware captions, especially Indonesian Discord banter. Use for a finished meme image, template selection, or meme caption writing; not for explaining an existing meme or generating original illustrations.
---

# Meme craft

Make a recognizable meme with a punchline, not an illustrated explanation.
Default to an existing template or the user's supplied image. Do not call an
image generator or redraw a template. Original AI artwork requires an explicit
request from the user. Caption-only requests need only text, not a file job.

## Find the joke before choosing the image

1. Read the request and relevant conversation in `/workspace/context.json`.
   Identify who said what, the actual target, and the shared situation. Retrieve
   a missing referenced message/image using the Discord bridge in `tooling.txt`.
   A filename, video title, or another person's quote is not evidence about the
   target. Do not invent quotes or carry a previous person's behavior to a new
   target. When context is sparse, use an obviously fictional relatable situation.
2. Find one comic tension: expectation vs reality, a tiny mistake after enormous
   effort, a suspiciously specific excuse, or two choices revealing the same
   weakness. Draft a few short alternatives privately and pick the strongest.
   Specific detail usually beats generic "AI bad" or "programmer tired" jokes.
3. Choose the format that makes the punchline visible. Examples, not routing rules:

   | Format | Visual function | Common failure |
   | --- | --- | --- |
   | Two Buttons | Sweating over choices that expose an embarrassing dilemma | Two ordinary options with no comic reason to panic |
   | Drake | Reject something reasonable, embrace an absurd alternative | Two long paragraphs or reversed panel meaning |
   | Distracted Boyfriend | Temptation distracts from an obligation | Labels over faces; unclear who is distracted |
   | Disaster Girl / This Is Fine | Smug responsibility / denial amid chaos | A literal disaster description with no twist |

   These are starting points, not a closed catalog. Use another template when it
   fits better; retain a template explicitly requested by the user.
4. Write like the conversation: natural Indonesian, compact phrasing, occasional
   code-switching if it helps. Put the surprise at the end. Caps can emphasize a
   punchline; random caps, emoji, "wkwk", or insults do not create one. Avoid
   forced slang and explaining the joke underneath. Keep roasting about the
   situation or visible behavior, not private data or invented allegations.

## Acquire and inspect a real template

- Prefer the supplied image. Otherwise discover blank templates from a public
  catalog, for example `https://api.imgflip.com/get_memes` (no login needed), or
  inspect the template page the user names. Read the returned names and URLs;
  do not guess an image URL or use a caption API that uploads the conversation.
- Download only the selected public image with `curl --fail --location`, a
  timeout, and a size bound; check that the result decodes as an image. Record
  the source URL in internal findings. Keep creator marks/credits in the image.
  If a source fails, try another actual template source. Do not silently replace
  the requested template with AI art, a drawing, or a prompt for the user to run.
- Inspect the actual pixels before positioning text. Match the template's panel
  order, empty caption areas, faces, gestures, and dimensions. When local image
  viewing is unavailable, do not claim visual inspection; use a verified layout
  or report the precise missing capability.

## Render locally

Python/Pillow and DejaVu fonts are installed in this worker. The bundled renderer
adds text to existing pixels without network calls or image-generation charges:

```sh
python3 /workspace/.agents/skills/meme-craft/scripts/caption.py \
  /workspace/template.jpg /workspace/layout.json /workspace/exports/meme.png
```

Write layout JSON using measured pixel coordinates for the inspected image:

```json
{"boxes":[{"text":"YOUR SHORT CAPTION","box":[30,30,400,90],
  "max_font":44,"min_font":22,"fill":"white","stroke":"black",
  "stroke_width":2,"angle":0}]}
```

`box` is `[x,y,width,height]`; `angle` is counterclockwise degrees. Choose black
text without an outline (`stroke_width: 0`) on a white template label; white
with a dark outline on photos. The renderer wraps and fits text, but refuses
overflow at the minimum size. Shorten the caption or change its box instead of
shrinking into unreadable text. Do not reuse example coordinates blindly.

For a specialized layout, adapt with Pillow; preserve the real template rather
than rebuilding its artwork. If the user explicitly wants an animated meme,
use available ffmpeg tooling and check timing/format separately. The renderer
handles still images only and rejects animated inputs instead of dropping frames.

## Check and deliver

- Open the output and inspect a phone-sized preview when an image viewer is
  available. Text must fit, read clearly, avoid faces/gestures/credits, and follow
  the template's joke. Check spelling and actual speaker attribution.
- If the joke still needs a paragraph to explain it, rewrite the caption. Do not
  add explanatory footnotes inside the meme. Revise layout until legible.
- Save only the chosen finished image under `/workspace/exports/`. The runner
  attaches up to two files, each <=4 MiB and <=6 MiB combined. Keep source images,
  layout JSON, drafts, and conversation excerpts outside exports.
- In the required final schema, use a short natural summary and the real exported
  filename, with no invented completion claim. Keep source/tool details in
  findings unless the user asks for them. If asked, state the actual template
  source, Python/Pillow editing, and any limitation honestly.

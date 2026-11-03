---
name: meme-craft
description: Create or revise still and animated memes using real templates, reaction images, screenshots and short Indonesian captions. Discover niche or requested references and avoid repeating recent formats. Use for meme files, template selection or captions; not for explaining an existing meme or generating original illustrations.
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
3. Choose the visible action or expression that carries the punchline: an awkward
   glance, exaggerated admiration, instant regret, misplaced confidence, a slow
   reveal, or an absurd literal reading. The image should add the joke, not merely
   decorate a caption that already explains everything. A wordplay such as
   "jilat atasan" can use either flattery or harmless literal absurdity; do not
   dismiss a relevant visual suggestion just because it changes the first reading.
   Read [template-discovery.md](references/template-discovery.md) when choosing an
   image, interpreting a named reference, or revising a repetitive meme.
   Retain a suitable template explicitly requested by the user. If they ask for
   more variety, inspect the recent meme/context and change its visual mechanism,
   not just the wording on the same template. Do not default to Drake/Two Buttons
   because they appear first in a catalog. Do not ban them when explicitly wanted.
4. Write like the conversation: natural Indonesian, compact phrasing, occasional
   code-switching if it helps. Put the surprise at the end. Caps can emphasize a
   punchline; random caps, emoji, "wkwk", or insults do not create one. Avoid
   forced slang and explaining the joke underneath. Keep roasting about the
   situation or visible behavior, not private data or invented allegations.

## Acquire and inspect a real template

- Prefer the supplied image or a specifically requested reference. Otherwise use
  public search for the action/expression, aliases, character or scene. Imgflip's
  `https://api.imgflip.com/get_memes` is a popular starting set, not the universe
  of templates. Check relevant template pages, original public posts, reaction
  GIFs or anime screenshots too. Compare plausible alternatives before picking
  one when no template was specified. Read actual names and image URLs; never
  guess a CDN path or upload the conversation to a captioning service.
- Download only the selected public image with `curl --fail --location`, a
  timeout, and a size bound; check that the result decodes as an image. Record
  the source URL in internal findings. Keep creator marks/credits in the image.
  If a source fails, try another actual template source. Do not silently replace
  the requested template with AI art, a drawing, or a prompt for the user to run.
- Inspect the actual pixels before positioning text. Match the template's panel
  order, empty caption areas, faces, gestures, and dimensions. When local image
  viewing is unavailable, do not claim visual inspection; use a verified layout
  or report the precise missing capability.
- Use nonsexual anime reactions. Do not use sexual/fetish depictions of children
  or school-age characters; offer a nonsexual version or another suitable visual.
  A body-part word or crude pun alone is not a reason to reject a harmless joke:
  assess the actual scene and context. Do not silently substitute another image
  while claiming to have used the requested reference.

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

For an image with no empty caption area, add an optional band:
`"padding":{"top":100,"bottom":0,"color":"white"}`. Coordinates refer to the
finished canvas, so the original image starts at y=100 in this example. The
renderer leaves the source pixels and proportions intact; do not cover a face
or gesture to force text onto it.

For a reaction GIF, use a `.gif` output: the renderer applies the caption to all
frames while retaining timing, looping and transparency. Inspect several frames
across the animation, not just its thumbnail. Animated input to `.png` is rejected
rather than silently flattened. Large animations may need an explicit, reviewed
resize/trim with Pillow or ffmpeg before captioning. For specialized layouts,
adapt with Pillow while preserving the actual template artwork.

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

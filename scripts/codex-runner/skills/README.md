# Bundled worker skills

## Local skills

`local/meme-craft` is maintained in this repository, separately from the irai
snapshot. It teaches template selection, Indonesian caption writing, attribution,
and visual review, and includes a local Pillow caption renderer for PNG/GIF and
optional caption bands. Its discovery reference covers named/niche reactions,
search beyond popular catalogs, and avoiding recently repeated formats. It uses existing
image templates, not an image generator. The worker image installs Pillow and
DejaVu fonts; `imageMode: "template"` explicitly selects this workflow and disables
the image-generation endpoint for that job. Template choices and captions are
made by the agent from context, not a keyword-routing table.

Both `local/*` and `irai/*` are copied into `/workspace/.agents/skills`. Rebuild
and select a new worker image tag after changing bundled skills or their tools.

## Reviewed irai snapshot

Source: `https://github.com/dimasma0305/irai` at commit
`e32691ac881396a1aa060f5174756bf7f44e5f22`.

Only `ctf-deep-solve` and `resourceful-solve` from irai are bundled. The isolated Codex
worker copies them into `/workspace/.agents/skills` at job startup so Codex can
discover the skill manifests and read supporting files as needed. These files
provide a workflow; they do not add network access, credentials, Discord
permissions, external tool binaries, or scoreboard submission capability.

Refresh the pinned snapshot after reviewing upstream changes:

```sh
python3 /root/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo dimasma0305/irai --ref <reviewed-commit> \
  --path .agents/skills/ctf-deep-solve .agents/skills/resourceful-solve \
  --dest scripts/codex-runner/skills/irai
```

The installer refuses to overwrite existing directories. Move the old bundle
aside before refreshing, then update this pinned commit, review the diff,
rebuild the worker image, and run the Codex benchmarks.

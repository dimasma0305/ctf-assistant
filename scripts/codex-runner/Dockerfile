FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ gdb binutils make autoconf bison re2c pkg-config libxml2-dev libsqlite3-dev libpcre2-dev zlib1g-dev file ripgrep unzip jq curl git sqlite3 poppler-utils librsvg2-bin ca-certificates && rm -rf /var/lib/apt/lists/*
COPY codex /usr/local/bin/codex
COPY codex-code-mode-host /usr/local/bin/codex-code-mode-host
COPY worker.py /opt/worker.py
COPY skills/ /opt/irai-skills/
RUN chmod 755 /usr/local/bin/codex /usr/local/bin/codex-code-mode-host /opt/worker.py && mkdir /workspace && chown 1000:1000 /workspace
USER 1000:1000
WORKDIR /workspace
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
ENTRYPOINT ["python3","/opt/worker.py"]

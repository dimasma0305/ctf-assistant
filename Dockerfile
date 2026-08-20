FROM oven/bun:1.3.14 AS app
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
EXPOSE 3000
COPY --chown=bun:bun . .
USER bun
CMD sh ./run.sh

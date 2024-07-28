FROM oven/bun:latest
WORKDIR /app
COPY package.json package.json
RUN bun install
COPY . .
CMD sh ./run.sh

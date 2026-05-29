FROM oven/bun:latest AS app
WORKDIR /app
COPY package.json package.json
RUN bun install --production
EXPOSE 3000
COPY . .
CMD sh ./run.sh

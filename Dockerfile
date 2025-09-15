FROM oven/bun:latest as app
WORKDIR /app
COPY package.json package.json
RUN bun install
EXPOSE 3000
COPY . .
CMD sh ./run.sh

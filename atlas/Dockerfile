FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY atlas ./atlas
COPY src ./src

ENV ATLAS_DB=/data/atlas.sqlite
ENV PORT=8080
EXPOSE 8080

CMD ["bun", "run", "atlas/server.ts"]

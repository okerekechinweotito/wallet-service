FROM oven/bun:latest

WORKDIR /app

# Copy package files first to leverage layer caching
COPY package.json package-lock.json* bun.lockb* ./ 2>/dev/null || true
COPY . /app

# Install dependencies
RUN bun install --production=false

EXPOSE 3000

# Run the server directly with Bun
CMD ["bun", "run", "src/server.ts"]

FROM oven/bun:latest

WORKDIR /app

# Copy package files first to leverage layer caching
# Note: Dockerfile's COPY does not support shell redirection or boolean operators.
# Use explicit COPY for package.json (lockfiles will be included when copying the context below).
COPY package.json ./
COPY . /app

# Install dependencies
RUN bun install --production=false

EXPOSE 3000

# Run the server directly with Bun
CMD ["bun", "run", "src/server.ts"]

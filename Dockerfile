FROM jarredsumner/bun:latest

WORKDIR /app

# Copy package files first to leverage Docker layer caching
COPY package.json bun.lockb* ./

# Install production dependencies
RUN bun install --production

# Copy remaining source files
COPY . .

EXPOSE 3000

ENV NODE_ENV=production

# Start the server. The app reads PORT from the environment.
CMD ["bun", "run", "src/server.ts"]

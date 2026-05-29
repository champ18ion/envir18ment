FROM node:20-alpine
RUN corepack enable

WORKDIR /app

# Copy monorepo root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy all workspace package manifests (pnpm requires all for lockfile validation)
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/cli/package.json ./apps/cli/
COPY packages/crypto/package.json ./packages/crypto/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/

# Install all deps (tsx is a devDep so we need everything)
RUN pnpm install --frozen-lockfile

# Copy source
COPY apps/api/src ./apps/api/src
COPY packages/crypto/src ./packages/crypto/src
COPY packages/db/src ./packages/db/src
COPY packages/types/src ./packages/types/src

ENV NODE_ENV=production PORT=4040
EXPOSE 4040

CMD ["node_modules/.bin/tsx", "apps/api/src/index.ts"]

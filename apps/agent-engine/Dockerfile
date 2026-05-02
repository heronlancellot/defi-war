FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/agent-engine ./apps/agent-engine
RUN pnpm install --frozen-lockfile
WORKDIR /app/apps/agent-engine
EXPOSE 3001
CMD ["pnpm", "dev"]

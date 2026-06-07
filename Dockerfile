# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# ---- api build ----
FROM deps AS api-build
COPY api ./api
COPY tsconfig.json ./
RUN npx tsc -p api/tsconfig.json

# ---- web build ----
FROM deps AS web-build
COPY . .
RUN npx vite build

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# prod-only deps (lock may not match; use install for resilience)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=api-build  /app/dist-api ./dist-api
COPY --from=web-build  /app/dist      ./dist
COPY --from=api-build  /app/api/migrations ./dist-api/migrations
COPY --from=api-build  /app/api/plugins ./dist-api/plugins

EXPOSE 5000
CMD ["node", "dist-api/server.js"]

FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
ARG STUDENT_URL=http://student:3001
ENV STUDENT_URL=$STUDENT_URL
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/student/package.json apps/student/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/ads-service/package.json apps/ads-service/package.json
RUN pnpm install --frozen-lockfile
RUN pnpm exec playwright install --with-deps chromium
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
COPY --from=build /root/.cache/ms-playwright /home/node/.cache/ms-playwright
COPY --from=build --chown=node:node /app /app
RUN node node_modules/@playwright/test/cli.js install-deps chromium
USER node
EXPOSE 3000 3001 4000
CMD ["node","dist/apps/api/src/main.js"]

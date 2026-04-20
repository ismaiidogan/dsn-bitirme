FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next.js projede public/ olmayabilir; runner aşaması COPY için boş klasör gerekir
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED 1
# Backend URL for server-side API proxy (rewrites). Required at build time for standalone.
ARG NEXT_PUBLIC_API_URL=http://backend:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ARG NEXT_INTERNAL_API_URL=http://backend:8000
ENV NEXT_INTERNAL_API_URL=${NEXT_INTERNAL_API_URL}
ARG NEXT_PUBLIC_AGENT_WINDOWS_URL=
ENV NEXT_PUBLIC_AGENT_WINDOWS_URL=${NEXT_PUBLIC_AGENT_WINDOWS_URL}
ARG NEXT_PUBLIC_AGENT_LINUX_URL=
ENV NEXT_PUBLIC_AGENT_LINUX_URL=${NEXT_PUBLIC_AGENT_LINUX_URL}
ARG NEXT_PUBLIC_AGENT_MAC_INTEL_URL=
ENV NEXT_PUBLIC_AGENT_MAC_INTEL_URL=${NEXT_PUBLIC_AGENT_MAC_INTEL_URL}
ARG NEXT_PUBLIC_AGENT_MAC_ARM64_URL=
ENV NEXT_PUBLIC_AGENT_MAC_ARM64_URL=${NEXT_PUBLIC_AGENT_MAC_ARM64_URL}
RUN npm run build

FROM node:20-alpine AS runner
RUN apk add --no-cache curl
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV NEXT_PUBLIC_API_URL=http://backend:8000
ENV NEXT_INTERNAL_API_URL=http://backend:8000
ENV NEXT_PUBLIC_AGENT_WINDOWS_URL=
ENV NEXT_PUBLIC_AGENT_LINUX_URL=
ENV NEXT_PUBLIC_AGENT_MAC_INTEL_URL=
ENV NEXT_PUBLIC_AGENT_MAC_ARM64_URL=

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]

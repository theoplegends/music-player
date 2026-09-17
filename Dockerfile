# Production runtime for Zenith is linux/amd64.
# The server has no npm dependencies, so there is no install step and no build stage.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

WORKDIR /app

# Only what the browser app actually serves.
COPY server.js ./
COPY index.html ./
COPY assets ./assets

# node:22-alpine ships an unprivileged `node` user.
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

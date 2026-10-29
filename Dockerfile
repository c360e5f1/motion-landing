FROM node:alpine

ENV NODE_ENV=production \
    # Inside the container the server must listen on all container interfaces,
    # or the published port can't reach it. Exposure is controlled by how the
    # port is published on the host: publish to loopback only, e.g.
    #   docker run -p 127.0.0.1:8080:8080 ...
    # and put the TLS reverse proxy in front of it.
    HOST=0.0.0.0 \
    PORT=8080 \
    ICONS_DIR=/app/icons

WORKDIR /app

# Copy only what the server needs at runtime. Tests and the app-icon generator stay out.
COPY --chown=root:root package.json server.js ./
COPY --chown=root:root lib/ ./lib/
COPY --chown=root:root templates/ ./templates/
COPY --chown=root:root public/ ./public/
# Sample icons as a fallback; normally a host folder is mounted over this.
COPY --chown=root:root icons/ ./icons/

# Run as the unprivileged user that ships with the official Node image.
# Files are owned by root and read-only to this user; the app never writes to disk.
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

# server.js already handles SIGTERM/SIGINT for a clean shutdown.
CMD ["node", "server.js"]

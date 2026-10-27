FROM node:24-alpine
WORKDIR /app
# Hangar passes project env vars as build secrets; record whether GREETING was available at build time.
RUN --mount=type=secret,id=GREETING \
    if [ -f /run/secrets/GREETING ]; then echo yes > build-secret; else echo no > build-secret; fi
COPY server.js .
# Deliberately not 3000 and not reading PORT: Hangar must find the port from EXPOSE.
EXPOSE 8080
CMD ["node", "server.js"]

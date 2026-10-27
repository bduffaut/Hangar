FROM node:24-alpine
# Builds fine, then exits on start, the way an app with a missing setting would.
CMD ["node", "-e", "console.error('fixture: broken-healthcheck refusing to start'); process.exit(1)"]

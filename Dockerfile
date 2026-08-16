# Builds the MCP server as a container. It exists for directory introspection —
# Glama starts the server and speaks MCP at it to confirm it works, and
# awesome-mcp-servers gates its listing on that check passing — but it is a normal
# stdio server image, usable anywhere a host can run a container.
#
#   docker build -t freehire-mcp .
#   docker run --rm -i -e FREEHIRE_TOKEN=fhk_... freehire-mcp
#
# The token is optional: without one the server still starts and lists its tools,
# and only tool calls fail, with a clear "not authenticated" error. That is what
# makes introspection possible without handing a directory a credential.

FROM node:22-alpine AS build

WORKDIR /app

# Dependencies first, so a source-only change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop the dev dependencies once the compile is done — nothing below needs typescript
# or vitest, and they are the bulk of the tree.
RUN npm prune --omit=dev

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# The server talks MCP over stdio, so it must own stdin/stdout: no shell wrapper,
# no npm indirection swallowing signals.
USER node
ENTRYPOINT ["node", "dist/index.js"]

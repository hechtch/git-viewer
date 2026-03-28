# Stage 1: Build frontend
FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npx ng build --configuration production

# Stage 2: Build backend
FROM node:18-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm install
COPY backend/ ./
RUN npx tsc

# Stage 3: Production image
FROM node:18-alpine
RUN apk add --no-cache git

WORKDIR /app

# Copy backend build output and production dependencies
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --omit=dev

COPY --from=backend-build /app/backend/dist ./backend/dist

# Copy frontend build output
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV GIT_REPO_PATH=/repo
ENV PORT=3000
EXPOSE 3000

# Mount your git repo to /repo at runtime:
#   docker run -v /path/to/your/repo:/repo -p 3000:3000 git-viewer
CMD ["node", "backend/dist/index.js"]

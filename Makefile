.PHONY: install install-backend install-frontend dev backend frontend build clean stop docker docker-run

# Default repo path (override with: make dev GIT_REPO_PATH=/path/to/repo)
GIT_REPO_PATH ?= ../sample-project

# Install all dependencies
install: install-backend install-frontend

install-backend:
	cd backend && npm install

install-frontend:
	cd frontend && npm install

# Run both servers concurrently in split output
dev: install
	GIT_REPO_PATH=$(GIT_REPO_PATH) \
	$(MAKE) -j2 backend frontend

backend:
	cd backend && GIT_REPO_PATH=$(GIT_REPO_PATH) npx ts-node src/index.ts

frontend:
	cd frontend && ng serve

# Production build
build:
	cd backend && npx tsc
	cd frontend && npx ng build

# Kill any lingering backend/frontend processes
stop:
	-lsof -ti :3000 | xargs kill 2>/dev/null
	-lsof -ti :4200 | xargs kill 2>/dev/null

# Docker
docker:
	docker build -t git-viewer .

docker-run: docker
	docker run --rm -v $(GIT_REPO_PATH):/repo -p 3000:3000 git-viewer

clean:
	rm -rf backend/dist
	rm -rf frontend/dist
	rm -rf backend/node_modules
	rm -rf frontend/node_modules

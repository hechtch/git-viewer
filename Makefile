CONTAINER_RUNTIME ?= podman

# Override with: make run GIT_REPO_PATH=/path/to/repo
GIT_REPO_PATH ?= ../sample-project

.PHONY: install install-backend install-frontend \
        run run-bg run-frontend run-backend \
        build build-frontend build-backend \
        test test-frontend test-backend \
        lint lint-frontend lint-backend \
        clean stop \
        container-build container-run container-push

install: install-backend install-frontend

install-backend:
	cd backend && npm install

install-frontend:
	cd frontend && npm install

run: install
	GIT_REPO_PATH=$(GIT_REPO_PATH) $(MAKE) -j2 run-frontend run-backend

run-bg: install
	GIT_REPO_PATH=$(GIT_REPO_PATH) npx ts-node backend/src/index.ts > /tmp/git-viewer-backend.log 2>&1 & \
	echo "[backend] PID $$! — logs: /tmp/git-viewer-backend.log"
	cd frontend && npx ng serve

run-frontend:
	cd frontend && npx ng serve

run-backend:
	cd backend && GIT_REPO_PATH=$(GIT_REPO_PATH) npx ts-node src/index.ts

build: build-backend build-frontend

build-frontend:
	cd frontend && npx ng build

build-backend:
	cd backend && npx tsc

test: test-frontend test-backend

test-frontend:
	cd frontend && npx ng test --code-coverage

test-backend:
	cd backend && npm test

lint: lint-frontend lint-backend

lint-frontend:
	cd frontend && npx ng lint

lint-backend:
	cd backend && npx eslint src

clean:
	rm -rf backend/dist frontend/dist backend/node_modules frontend/node_modules

stop:
	-lsof -ti :3000 | xargs kill 2>/dev/null
	-lsof -ti :4200 | xargs kill 2>/dev/null

container-build:
	$(CONTAINER_RUNTIME) build -t git-viewer:latest .

container-run:
	$(CONTAINER_RUNTIME) run --rm -v $(GIT_REPO_PATH):/repo -p 3000:3000 git-viewer:latest

container-push:
	$(CONTAINER_RUNTIME) push git-viewer:latest

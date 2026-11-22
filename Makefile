MISE := $(shell command -v mise 2>/dev/null)
RUN := $(MISE) exec --

.PHONY: dev vendor assets lint format test serve deploy publish _check_mise

# Install the pinned Node and the locked packages, and copy the page's libraries.
dev: _check_mise
	$(MISE) install
	$(RUN) npm ci
	$(MAKE) vendor assets

# The page's libraries, copied from node_modules into public/vendor/ (gitignored).
vendor:
	mkdir -p public/vendor
	cp node_modules/markdown-it/dist/markdown-it.min.js public/vendor/
	cp node_modules/dompurify/dist/purify.min.js public/vendor/

# The icons in public/icons/: where it has a files.toml, they are kept on Drive (drive-files
# skill) and pulled here; elsewhere they are plain files and there is nothing to do.
assets:
	@if [ -f public/icons/files.toml ]; then google-mcp files pull public/icons; fi

lint: _check_mise
	$(RUN) npx biome check .
	$(RUN) npx tsc --noEmit

format: _check_mise
	$(RUN) npx biome check --write .

test: _check_mise
	$(RUN) npx vitest run --passWithNoTests

# The page and /api/token at http://localhost:8787, secret from .dev.vars (DESIGN.md, Local dev).
serve: _check_mise vendor assets
	$(RUN) npx wrangler dev --port 8787

# Publish the Worker and public/ to Cloudflare.
deploy: _check_mise lint test vendor assets
	$(RUN) npx wrangler deploy

# Mirror the committed state of this folder to the public repo (DEPLOYMENT.md, Publishing).
publish: assets
	uv run --script scripts/publish.py

_check_mise:
ifndef MISE
	$(error mise not found. Install it with: curl https://mise.run | sh)
endif

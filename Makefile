.PHONY: setup start dev test lint clean docker-up docker-down db-migrate db-studio

setup:
	pnpm install
	cd apps/api && pnpm prisma generate

dev:
	pnpm dev

build:
	pnpm build

test:
	pnpm test

lint:
	pnpm lint

docker-up:
	cd apps/api && docker-compose up -d

docker-down:
	cd apps/api && docker-compose down

db-migrate:
	cd apps/api && pnpm prisma:migrate

db-studio:
	cd apps/api && pnpm prisma:studio

clean:
	find . -name "node_modules" -type d -prune -exec rm -rf '{}' +
	find . -name "dist" -type d -prune -exec rm -rf '{}' +
	find . -name ".turbo" -type d -prune -exec rm -rf '{}' +

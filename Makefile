.PHONY: setup start dev test lint clean docker-up docker-down db-migrate db-studio

setup:
	yarn install
	cd apps/api && yarn prisma:generate

dev:
	yarn dev

build:
	yarn build

test:
	yarn test

lint:
	yarn lint

docker-up:
	cd apps/api && docker-compose up -d

docker-down:
	cd apps/api && docker-compose down

db-migrate:
	cd apps/api && yarn prisma:migrate

db-studio:
	cd apps/api && yarn prisma:studio

clean:
	find . -name "node_modules" -type d -prune -exec rm -rf '{}' +
	find . -name "dist" -type d -prune -exec rm -rf '{}' +
	find . -name ".turbo" -type d -prune -exec rm -rf '{}' +

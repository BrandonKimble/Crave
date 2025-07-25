#!/bin/bash
# setup-test-db.sh - Setup test database for integration tests

set -e  # Exit on any error

echo "🚀 Setting up test database for Crave Search API..."

# Check if PostgreSQL is running
if ! pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    echo "❌ PostgreSQL is not running on localhost:5432"
    echo "💡 Start PostgreSQL with: pnpm docker:up"
    exit 1
fi

echo "✅ PostgreSQL is running"

# Check if development database exists and create if not
if ! psql -h localhost -p 5432 -U postgres -lqt | cut -d \| -f 1 | grep -qw crave_search; then
    echo "📦 Creating development database: crave_search"
    createdb -h localhost -p 5432 -U postgres crave_search
else
    echo "✅ Development database exists"
fi

# Check if test database exists and create if not
if ! psql -h localhost -p 5432 -U postgres -lqt | cut -d \| -f 1 | grep -qw crave_search_test; then
    echo "📦 Creating test database: crave_search_test"
    createdb -h localhost -p 5432 -U postgres crave_search_test
else
    echo "✅ Test database exists"
fi

# Run migrations on both databases
echo "🔄 Running migrations on development database..."
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crave_search" npx prisma migrate deploy

echo "🔄 Running migrations on test database..."
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crave_search_test" npx prisma migrate deploy

echo "🎉 Test database setup complete!"
echo ""
echo "🧪 You can now run integration tests with:"
echo "   pnpm test                    # Unit tests"
echo "   pnpm test:e2e               # E2E tests"
echo "   npx jest --testPathPattern=integration  # Integration tests only"
echo ""
echo "🔧 Database URLs:"
echo "   Development: postgresql://postgres:postgres@localhost:5432/crave_search"
echo "   Test:        postgresql://postgres:postgres@localhost:5432/crave_search_test"
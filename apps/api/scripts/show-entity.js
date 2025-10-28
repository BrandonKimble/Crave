const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const entity = await prisma.entity.findFirst({
    select: { entityId: true, name: true, type: true },
  });
  console.log(entity);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

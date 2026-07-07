import { prisma } from "../lib/db/prisma";
import { ensureDepartments } from "../lib/db/ensureDepartments";

async function main() {
  console.log("Seeding departments...");
  await ensureDepartments();
  const total = await prisma.department.count();
  console.log(`Done - ${total} departments in database.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

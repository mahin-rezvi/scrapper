import { prisma } from "./prisma";
import { DEPARTMENTS } from "../scraper/departments";

export async function ensureDepartments() {
  await Promise.all(
    DEPARTMENTS.map((department) =>
      prisma.department.upsert({
        where: { code: department.code },
        update: { name: department.name },
        create: department,
      })
    )
  );
}

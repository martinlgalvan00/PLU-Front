import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const plans = await prisma.$queryRaw`SELECT id, code, active, price, manual_price, collection_mode, retired_at, effective_from FROM public.membership_plans ORDER BY created_at ASC`
  console.log(plans)
}

main().finally(() => prisma.$disconnect())

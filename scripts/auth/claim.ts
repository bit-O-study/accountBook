// Server operator only: npx tsx scripts/auth/claim.ts --user-id <legacy-user-id>
import { prisma } from "../../src/lib/db";
import { issueClaimCode } from "../../src/lib/auth/service";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--list") {
    console.table(await prisma.user.findMany({ where: { email: null, passwordHash: null }, select: { id: true, name: true } }));
    return;
  }
  if (args.length !== 2 || args[0] !== "--user-id") throw new Error("사용법: tsx scripts/auth/claim.ts --user-id <기존 사용자 ID>");
  const result = await issueClaimCode(args[1]);
  console.log(`가입 화면의 ‘기존 가계부 연결’에 입력하세요. 30분 뒤 만료되며 한 번만 쓸 수 있습니다.\n${result.token}`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "발급하지 못했습니다."); process.exitCode = 1; }).finally(() => prisma.$disconnect());

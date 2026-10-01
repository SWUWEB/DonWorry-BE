import { prisma } from '../src/prisma/client.js';
import { reconcileKakaoWithdrawalAttempt } from '../src/features/users/users.withdrawal.service.js';

let failures = 0;
try {
  const attempts = await prisma.withdrawalAttempt.findMany({
    where: { createdAt: { lt: new Date(Date.now() - 120_000) } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  for (const attempt of attempts) {
    try {
      await reconcileKakaoWithdrawalAttempt(attempt.id);
      console.info('Kakao withdrawal reconciled', { attemptId: attempt.id.toString() });
    } catch (error) {
      failures += 1;
      console.error('Kakao withdrawal reconciliation failed', {
        attemptId: attempt.id.toString(),
        status: error.statusCode ?? 500,
        code: error.errorCode ?? null,
      });
    }
  }
} finally {
  await prisma.$disconnect();
}

if (failures > 0) process.exitCode = 1;

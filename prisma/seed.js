import { prisma } from '../src/prisma/client.js';

const questions = [
  { questionText: '지금 이 상품이 꼭 필요한가요?', sortOrder: 1, riskWeight: 1 },
  { questionText: '비슷한 물건을 최근에 구매했나요?', sortOrder: 2, riskWeight: 1 },
  { questionText: '예산을 초과하는 소비인가요?', sortOrder: 3, riskWeight: 1 },
];

await prisma.$transaction(
  questions.map((question) =>
    prisma.interventionQuestion.upsert({
      where: { sortOrder: question.sortOrder },
      update: question,
      create: question,
    }),
  ),
);

await prisma.$disconnect();

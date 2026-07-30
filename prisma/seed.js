import { prisma } from '../src/prisma/client.js';

const questions = [
  {
    questionText: '혹시 이거,이미 가지고 있진 않나요?',
    sortOrder: 1,
    riskWeight: 2,
  },
  {
    questionText: '이거, 지금 꼭 필요한 걸까요?',
    sortOrder: 2,
    riskWeight: 1,
  },
  {
    questionText: '비슷한 거, 최근에 산 적 있지 않나요?',
    sortOrder: 3,
    riskWeight: 2,
  },
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

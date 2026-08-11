import { prisma } from '../../prisma/client.js';
import { DAILY_QUESTIONS } from '../../config/daily-questions.js';
import { CATEGORY_MAP } from '../../config/categories.js';
import { getBudget } from '../users/users.service.js';
import { HttpError } from '../../utils/http-error.js';
import { ERROR_CODES } from '../../config/error-codes.js';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const getKst = (date = new Date()) => new Date(date.getTime() + KST_OFFSET_MS);

const getYearMonth = (date) => {
  const kst = getKst(date);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const getMonthRange = (date, offset = 0) => {
  const kst = getKst(date);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + offset;
  return {
    startAt: new Date(Date.UTC(year, month, 1) - KST_OFFSET_MS),
    endAt: new Date(Date.UTC(year, month + 1, 1) - KST_OFFSET_MS),
  };
};

const getKstDateKey = (date) => {
  const kst = getKst(date);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

const calculateRatio = (amount, total) => {
  if (total === 0) return 0;
  return Math.round((amount / total) * 100);
};

const buildGoalAchievement = (skippedAmount, targetAmount) => {
  if (!targetAmount) {
    return {
      status: 'NOT_SET',
      rate: 0,
      remainingAmount: null,
      message: '이번 달 절약 목표를 설정해보세요.',
    };
  }
  const target = Number(targetAmount);
  const rate = Math.min(100, calculateRatio(skippedAmount, target));
  if (skippedAmount >= target) {
    return {
      status: 'ACHIEVED',
      rate: 100,
      remainingAmount: null,
      message: '이번 달 절약 목표를 달성했어요! 🎉',
    };
  }
  return {
    status: 'IN_PROGRESS',
    rate,
    remainingAmount: target - skippedAmount,
    message: `이번 달 목표 ${rate}% 달성했어요 🎯`,
  };
};

const buildRemainingBudget = (budget, thisAmount) => {
  if (!budget) {
    return { status: 'NOT_SET', amount: null, message: '이번 달 예산을 설정해주세요.' };
  }
  const budgetAmount = Number(budget.monthlyBudget);
  const remaining = budgetAmount - thisAmount;

  if (remaining >= 0) return { status: 'WITHIN', amount: remaining, message: '목표까지 남았어요' };
  const exceeded = Math.abs(remaining);
  return {
    status: 'EXCEEDED',
    amount: remaining,
    message: `예산을 ${exceeded.toLocaleString()}원 초과했어요`,
  };
};

const buildConsumptionChart = (records) => {
  if (records.length === 0) {
    return {
      hasData: false,
      categories: [],
      others: null,
      summaryText: '이번 달 소비 기록이 아직 없어요.',
    };
  }
  const categoryTotals = new Map();
  for (const record of records) {
    const code = record.categoryCode ?? 'ETC';
    const label = record.categoryLabel ?? CATEGORY_MAP[code] ?? '기타';
    const price = Number(record.price ?? 0);

    if (categoryTotals.has(code)) {
      const current = categoryTotals.get(code);
      current.amount += price;
    } else {
      categoryTotals.set(code, { categoryCode: code, categoryLabel: label, amount: price });
    }
  }
  const sortedCategories = Array.from(categoryTotals.values()).sort((a, b) => b.amount - a.amount);
  const totalAmount = sortedCategories.reduce((sum, item) => sum + item.amount, 0);
  const topCategories = sortedCategories.slice(0, 4);
  const restCategories = sortedCategories.slice(4);
  const categories = topCategories.map((item) => ({
    categoryCode: item.categoryCode,
    categoryLabel: item.categoryLabel,
    amount: item.amount,
    ratio: calculateRatio(item.amount, totalAmount),
  }));

  let others = null;
  if (restCategories.length > 0) {
    const restAmount = restCategories.reduce((sum, item) => sum + item.amount, 0);
    others = {
      amount: restAmount,
      ratio: calculateRatio(restAmount, totalAmount),
    };
  }
  const topItem = sortedCategories[0];
  const topRatio = calculateRatio(topItem.amount, totalAmount);
  return {
    hasData: true,
    categories,
    others,
    summaryText: `이번 달에는 ${topItem.categoryLabel} 소비가 전체 지출의 ${topRatio}%를 차지했어요.`,
  };
};

const buildThisMonthSpending = (thisAmount, lastAmount) => {
  if (lastAmount <= 0) {
    return {
      amount: thisAmount,
      comparisonRate: null,
      comparisonMessage: null,
    };
  }
  const diffRate = Math.round(((thisAmount - lastAmount) / lastAmount) * 100);
  let comparisonMessage = '지난달과 같아요';
  if (diffRate > 0) comparisonMessage = `지난달보다 +${diffRate}%`;
  if (diffRate < 0) comparisonMessage = `지난달보다 ${diffRate}%`;
  return { amount: thisAmount, comparisonRate: diffRate, comparisonMessage };
};

export const getHomeSummary = async (userId, now = new Date()) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { targetSavingAmount: true },
  });
  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.USER4041,
    });
  }
  const yearMonth = getYearMonth(now);
  const { startAt, endAt } = getMonthRange(now);
  const { startAt: prevStartAt, endAt: prevEndAt } = getMonthRange(now, -1);

  const [thisMonthRecords, lastMonthAgg, skippedAgg, budget] = await Promise.all([
    prisma.consumptionRecord.findMany({
      where: { userId, type: 'CONSUMED', occurredAt: { gte: startAt, lt: endAt } },
      select: { categoryCode: true, categoryLabel: true, price: true },
    }),
    prisma.consumptionRecord.aggregate({
      where: { userId, type: 'CONSUMED', occurredAt: { gte: prevStartAt, lt: prevEndAt } },
      _sum: { price: true },
    }),
    prisma.consumptionRecord.aggregate({
      where: { userId, type: 'SKIPPED', occurredAt: { gte: startAt, lt: endAt } },
      _sum: { price: true },
    }),
    getBudget(userId, yearMonth),
  ]);

  const thisAmount = thisMonthRecords.reduce((sum, record) => sum + Number(record.price ?? 0), 0);
  const lastAmount = Number(lastMonthAgg._sum.price ?? 0);
  const skippedAmount = Number(skippedAgg._sum.price ?? 0);

  return {
    goalAchievement: buildGoalAchievement(skippedAmount, user.targetSavingAmount),
    consumptionChart: buildConsumptionChart(thisMonthRecords),
    thisMonthSpending: buildThisMonthSpending(thisAmount, lastAmount),
    remainingBudget: buildRemainingBudget(budget, thisAmount),
  };
};

export const getDailyQuestion = async (now = new Date()) => {
  const dateKey = getKstDateKey(now);
  const questionIndex = Number(dateKey) % DAILY_QUESTIONS.length;
  return {
    questionText: DAILY_QUESTIONS[questionIndex],
    date: `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`,
  };
};

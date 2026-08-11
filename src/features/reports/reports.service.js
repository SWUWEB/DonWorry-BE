import { prisma } from '../../prisma/client.js';
import { HttpError } from '../../utils/http-error.js';
import { ERROR_CODES } from '../../config/error-codes.js';

const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
const toKst = (date) => new Date(date.getTime() + 9 * 60 * 60 * 1000);
const toYearMonth = (date) => {
  const kst = toKst(date);
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${month}`;
};

const getMonthRange = (month, now) => {
  const currentMonth = toYearMonth(now);
  const targetMonth = month ?? currentMonth;

  if (targetMonth > currentMonth) {
    throw new HttpError(400, '미래 월은 조회할 수 없습니다.', {
      errorCode: ERROR_CODES.REPORT4001,
    });
  }

  const [year, monthNum] = targetMonth.split('-').map(Number);
  const startAt = new Date(Date.UTC(year, monthNum - 1, 1) - 9 * 60 * 60 * 1000);
  const endAt = new Date(Date.UTC(year, monthNum, 1) - 9 * 60 * 60 * 1000);
  return { targetMonth, startAt, endAt };
};

const getDomain = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

const groupByCategory = (records) => {
  const map = new Map();

  for (const record of records) {
    const code = record.categoryCode ?? 'ETC';
    if (!map.has(code)) {
      map.set(code, {
        categoryCode: code,
        categoryLabel: record.categoryLabel ?? '기타',
        skippedAmount: 0,
        consumedAmount: 0,
      });
    }
    const category = map.get(code);
    if (record.type === 'SKIPPED') {
      category.skippedAmount += Number(record.price);
    } else {
      category.consumedAmount += Number(record.price);
    }
  }
  return [...map.values()];
};

const getTotalConsumption = (categories) => {
  const totalAmount = categories.reduce((sum, c) => sum + c.consumedAmount, 0);
  if (totalAmount === 0) return { totalAmount: 0, categories: [] };

  const sorted = categories
    .filter((c) => c.consumedAmount > 0)
    .sort((a, b) => b.consumedAmount - a.consumedAmount);
  const result = sorted.slice(0, 4).map((c) => ({
    categoryCode: c.categoryCode,
    categoryLabel: c.categoryLabel,
    amount: c.consumedAmount,
    ratio: Math.round((c.consumedAmount / totalAmount) * 100),
  }));

  const others = sorted.slice(4);
  if (others.length > 0) {
    const otherAmount = others.reduce((sum, c) => sum + c.consumedAmount, 0);
    result.push({
      categoryCode: 'ETC',
      categoryLabel: '그 외',
      amount: otherAmount,
      ratio: Math.round((otherAmount / totalAmount) * 100),
    });
  }
  return { totalAmount, categories: result };
};

const getCategoryDefenseSummary = (categories) => {
  return categories
    .filter((c) => c.skippedAmount > 0 || c.consumedAmount > 0)
    .map((c) => {
      const total = c.skippedAmount + c.consumedAmount;
      return {
        categoryCode: c.categoryCode,
        categoryLabel: c.categoryLabel,
        skippedAmount: c.skippedAmount,
        consumedAmount: c.consumedAmount,
        defenseRate: total === 0 ? 0 : Math.round((c.skippedAmount / total) * 100),
      };
    })
    .sort((a, b) => b.skippedAmount + b.consumedAmount - (a.skippedAmount + a.consumedAmount));
};

const getSavingStatus = (records) => {
  const status = {
    totalAttemptCount: records.length,
    skipped: { amount: 0, count: 0 },
    consumed: { amount: 0, count: 0 },
  };
  for (const record of records) {
    const target = record.type === 'SKIPPED' ? status.skipped : status.consumed;
    target.amount += Number(record.price);
    target.count += 1;
  }
  return status;
};

const getGoalAchievement = (skippedAmount, targetAmount) => {
  if (targetAmount === null) {
    return {
      status: 'NOT_SET',
      achievementRate: 0,
      targetAmount: null,
      savedAmount: skippedAmount,
      remainingAmount: null,
    };
  }

  const target = Number(targetAmount);
  const achieved = target > 0 && skippedAmount >= target;
  const rate = target === 0 ? 0 : Math.min(100, Math.round((skippedAmount / target) * 100));

  return {
    status: achieved ? 'ACHIEVED' : 'IN_PROGRESS',
    achievementRate: rate,
    targetAmount: target,
    savedAmount: skippedAmount,
    remainingAmount: achieved ? null : Math.max(target - skippedAmount, 0),
  };
};

const getVulnerableTime = (consumedRecords, totalAmount) => {
  const map = new Map();
  for (const record of consumedRecords) {
    const kst = toKst(record.occurredAt);
    const key = `${kst.getUTCDay()}-${kst.getUTCHours()}`;
    if (!map.has(key)) {
      map.set(key, { weekday: kst.getUTCDay(), hour: kst.getUTCHours(), amount: 0, count: 0 });
    }
    const slot = map.get(key);
    slot.amount += Number(record.price);
    slot.count += 1;
  }
  const list = [...map.values()].sort((a, b) => b.amount - a.amount || b.count - a.count);
  const top = list[0];
  return {
    type: 'VULNERABLE_TIME',
    weekdayLabel: weekdayNames[top.weekday],
    hour: top.hour,
    amount: top.amount,
    ratio: Math.round((top.amount / totalAmount) * 100),
  };
};

const getInflowChannel = (consumedRecords) => {
  const hasUrl = consumedRecords.some((record) => Boolean(record.productUrl));
  if (!hasUrl) return null;

  const map = new Map();
  for (const record of consumedRecords) {
    const channel = record.productUrl ? (getDomain(record.productUrl) ?? '직접 입력') : '직접 입력';
    map.set(channel, (map.get(channel) ?? 0) + 1);
  }
  const list = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const [channel, count] = list[0];
  return { type: 'INFLOW_CHANNEL', channel, count };
};

const getInsights = (consumedRecords, totalAmount) => {
  if (consumedRecords.length < 3) {
    return { hasEnoughData: false, insights: [] };
  }
  const insights = [
    getVulnerableTime(consumedRecords, totalAmount),
    getInflowChannel(consumedRecords),
  ].filter(Boolean);
  return { hasEnoughData: true, insights };
};

export const getConsumptionReportDetail = async ({ userId, month, now = new Date() }) => {
  const { targetMonth, startAt, endAt } = getMonthRange(month, now);

  const [user, records] = await Promise.all([
    prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { targetSavingAmount: true, savingGoalIsActive: true },
    }),
    prisma.consumptionRecord.findMany({
      where: {
        userId: BigInt(userId),
        price: { gt: 0 },
        occurredAt: { gte: startAt, lt: endAt },
      },
      orderBy: [{ occurredAt: 'asc' }],
    }),
  ]);
  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.USER4041,
    });
  }

  const consumedRecords = records.filter((r) => r.type === 'CONSUMED');
  const categories = groupByCategory(records);
  const savingStatus = getSavingStatus(records);
  const targetAmount =
    user.savingGoalIsActive && user.targetSavingAmount !== null ? user.targetSavingAmount : null;
  return {
    reportMonth: targetMonth,
    totalConsumption: getTotalConsumption(categories),
    savingStatus,
    goalAchievement: getGoalAchievement(savingStatus.skipped.amount, targetAmount),
    insights: getInsights(consumedRecords, savingStatus.consumed.amount),
    categoryDefenseSummary: getCategoryDefenseSummary(categories),
  };
};

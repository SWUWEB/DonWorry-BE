import { CATEGORY_CODE_SET } from '../../config/categories.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { prisma } from '../../prisma/client.js';
import { HttpError } from '../../utils/http-error.js';

const QUESTION_PRESENTATION = {
  1: {
    description: '집 어딘가에 비슷한 물건이 있을 수도 있어요. 한 번 떠올려볼까요?',
    options: [
      { answerValue: false, label: '없는 것 같아요' },
      { answerValue: true, label: '있는 것 같아요' },
    ],
  },
  2: {
    description: '조금만 미뤄도 괜찮을지 한 번 생각해봐도 좋아요.',
    options: [
      { answerValue: false, label: '지금 당장 필요해요' },
      { answerValue: true, label: '나중에도 괜찮아요' },
    ],
  },
  3: {
    description: '비슷한 소비가 계속 이어지고 있을 수도 있어요. 한 번 돌아볼까요?',
    options: [
      { answerValue: true, label: '최근에 산 적 있어요' },
      { answerValue: false, label: '최근에 산 적 없어요' },
    ],
  },
};

const requiredQuestionWhere = {
  isActive: true,
  sortOrder: { in: [1, 2, 3] },
};

const REQUIRED_RISK_WEIGHT_BY_SORT_ORDER = new Map([
  [1, 2],
  [2, 1],
  [3, 2],
]);

export const listInterventionQuestions = async ({ userId, categoryCode }) => {
  if (!CATEGORY_CODE_SET.has(categoryCode)) {
    throw new HttpError(400, '허용되지 않은 카테고리 코드입니다.', {
      errorCode: ERROR_CODES.CONSUMPTION_RECORD4002,
    });
  }

  try {
    const [questions, totalCount, records] = await prisma.$transaction([
      prisma.interventionQuestion.findMany({
        where: requiredQuestionWhere,
        orderBy: { sortOrder: 'asc' },
        select: { id: true, questionText: true, sortOrder: true },
      }),
      prisma.consumptionRecord.count({
        where: { userId: BigInt(userId), categoryCode, type: 'CONSUMED' },
      }),
      prisma.consumptionRecord.findMany({
        where: { userId: BigInt(userId), categoryCode, type: 'CONSUMED' },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 3,
        select: { id: true, productName: true, price: true, occurredAt: true },
      }),
    ]);

    if (questions.length !== 3) {
      throw new HttpError(404, '활성화된 개입 질문을 찾을 수 없습니다.', {
        errorCode: ERROR_CODES.INTERVENTION4041,
      });
    }

    return {
      questions: questions.map((question) => ({
        questionId: question.id.toString(),
        questionText: question.questionText,
        description: QUESTION_PRESENTATION[question.sortOrder].description,
        sortOrder: question.sortOrder,
        options: QUESTION_PRESENTATION[question.sortOrder].options,
      })),
      recentCategoryConsumption: {
        categoryCode,
        totalCount,
        records: records.map((record) => ({
          consumptionRecordId: record.id.toString(),
          productName: record.productName,
          price: Number(record.price),
          occurredAt: record.occurredAt.toISOString(),
        })),
      },
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(500, '개입 질문을 조회하는 중 오류가 발생했습니다.', {
      errorCode: ERROR_CODES.INTERVENTION5001,
    });
  }
};

export const calculateRisk = async ({ interventionAnswers }) => {
  const ids = interventionAnswers.map(({ questionId }) => questionId.toString());
  if (new Set(ids).size !== ids.length) {
    throw new HttpError(400, '동일한 질문에 대한 답변을 중복해서 등록할 수 없습니다.', {
      errorCode: ERROR_CODES.CONSUMPTION_RECORD4003,
    });
  }

  try {
    const questions = await prisma.interventionQuestion.findMany({
      where: {
        id: { in: interventionAnswers.map(({ questionId }) => questionId) },
        isActive: true,
      },
      select: { id: true, sortOrder: true, riskWeight: true },
    });

    if (questions.length !== interventionAnswers.length) {
      throw new HttpError(404, '요청한 질문을 찾을 수 없습니다.', {
        errorCode: ERROR_CODES.CONSUMPTION_RECORD4042,
      });
    }

    const requiredOrders = new Set(questions.map(({ sortOrder }) => sortOrder));
    if (
      interventionAnswers.length !== 3 ||
      ![1, 2, 3].every((sortOrder) => requiredOrders.has(sortOrder))
    ) {
      throw new HttpError(400, '필수 개입 질문에 모두 답변해 주세요.', {
        errorCode: ERROR_CODES.RISK4001,
      });
    }

    const hasValidRiskPolicy = questions.every(
      ({ sortOrder, riskWeight }) =>
        REQUIRED_RISK_WEIGHT_BY_SORT_ORDER.get(sortOrder) === riskWeight,
    );
    if (!hasValidRiskPolicy) {
      throw new HttpError(500, '소비 위험도 점수 정책이 올바르지 않습니다.', {
        errorCode: ERROR_CODES.RISK5001,
      });
    }

    const questionById = new Map(questions.map((question) => [question.id.toString(), question]));
    const riskScore = interventionAnswers.reduce(
      (sum, answer) =>
        sum + (answer.answerValue ? questionById.get(answer.questionId.toString()).riskWeight : 0),
      0,
    );

    if (riskScore <= 1) {
      return { riskScore, riskLevel: 'LOW', riskMessage: '충동소비 가능성 낮음' };
    }
    if (riskScore <= 3) {
      return {
        riskScore,
        riskLevel: 'MEDIUM',
        riskMessage: '충동소비 가능성은 낮지만 좀 더 생각해보세요.',
      };
    }
    return { riskScore, riskLevel: 'HIGH', riskMessage: '충동소비 가능성 높음' };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(500, '소비 위험도를 계산하는 중 오류가 발생했습니다.', {
      errorCode: ERROR_CODES.RISK5001,
    });
  }
};

import { z } from 'zod';

export const INTEREST_TAGS = [
  '음식',
  '교통',
  '쇼핑',
  '저축',
  '뷰티',
  '교육',
  '스포츠',
  '가족',
  '댄스',
  '문화생활',
  '반려동물',
  '기타',
];

const interestTagsBase = z
  .array(z.enum(INTEREST_TAGS, { message: '유효한 관심 소비 영역이 아닙니다.' }))
  .max(3, '관심 소비 영역은 최대 3개까지 선택할 수 있습니다.');

const noDuplicates = (tags) => new Set(tags).size === tags.length;
const duplicateMessage = { message: '관심 소비 영역은 중복될 수 없습니다.' };

export const interestTagsSchema = interestTagsBase.refine(noDuplicates, duplicateMessage);

export const requiredInterestTagsSchema = interestTagsBase
  .min(1, '관심 소비 영역을 1개 이상 선택해주세요.')
  .refine(noDuplicates, duplicateMessage);

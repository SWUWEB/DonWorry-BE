export const CATEGORIES = [
  { category_code: 'FASHION', category_label: '패션' },
  { category_code: 'BEAUTY', category_label: '뷰티' },
  { category_code: 'FOOD_SNACK', category_label: '음식' },
  { category_code: 'CAFE_DESSERT', category_label: '카페/디저트' },
  { category_code: 'HOBBY_GOODS', category_label: '취미/굿즈' },
  { category_code: 'ELECTRONICS', category_label: '전자기기' },
  { category_code: 'HEALTH_FITNESS', category_label: '건강/운동' },
  { category_code: 'TRAVEL', category_label: '여행' },
  { category_code: 'ETC', category_label: '기타' },
];

export const CATEGORY_CODES = CATEGORIES.map(({ category_code }) => category_code);

export const CATEGORY_CODE_SET = new Set(CATEGORY_CODES);

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map(({ category_code, category_label }) => [category_code, category_label]),
);

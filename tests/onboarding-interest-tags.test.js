import assert from 'node:assert/strict';
import test from 'node:test';
import { INTEREST_TAGS } from '../src/config/interest-tags.js';
import { upsertOnboardingDto } from '../src/features/onboarding/onboarding.dto.js';
import { updateMeDto } from '../src/features/users/users.dto.js';

const [a, b, c, d] = INTEREST_TAGS;

const parsers = {
  onboarding: (interestTags) =>
    upsertOnboardingDto.safeParse({
      body: { interestTags, savingGoalText: '여행', targetSavingAmount: 500000 },
    }),
  profile: (interestTags) => updateMeDto.safeParse({ body: { interestTags } }),
};

test('INTEREST_TAGS 상수는 중복 없는 12개 배열이어야 한다', () => {
  assert.equal(INTEREST_TAGS.length, 12);
  assert.equal(new Set(INTEREST_TAGS).size, 12);
});

for (const [name, parse] of Object.entries(parsers)) {
  test(`${name}: 유효 라벨 1~3개 입력 시 검증 성공`, () => {
    for (const tags of [[a], [a, b], [a, b, c]]) {
      assert.equal(parse(tags).success, true);
    }
  });

  test(`${name}: 유효하지 않은 입력값 시 검증 실패 및 에러 메시지 반환`, () => {
    const cases = [
      [[a, '없는라벨'], /유효한 관심 소비 영역이 아닙니다/],
      [[` ${a}`], /유효한 관심 소비 영역이 아닙니다/],
      [[a, b, c, d], /최대 3개/],
      [[a, a], /중복될 수 없습니다/],
    ];
    for (const [tags, message] of cases) {
      const result = parse(tags);
      assert.equal(result.success, false);
      assert.match(result.error.message, message);
    }
  });
}

test('빈 배열은 온보딩에서 거부하고 프로필 수정에서는 허용한다', () => {
  assert.equal(parsers.onboarding([]).success, false);
  assert.equal(parsers.profile([]).success, true);
});

test('프로필 수정은 interestTags를 생략해도 통과한다', () => {
  assert.equal(updateMeDto.safeParse({ body: { nickname: '홍길동' } }).success, true);
});

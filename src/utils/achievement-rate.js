const parseDecimal = (value) => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.toString());
  if (!match) throw new TypeError('금액은 0 이상의 숫자여야 합니다.');
  const fraction = match[2] ?? '';
  return {
    unscaled: BigInt(`${match[1]}${fraction}`),
    scale: fraction.length,
  };
};

export const calculateAchievementRate = (savedAmount, targetAmount) => {
  const saved = parseDecimal(savedAmount);
  const target = parseDecimal(targetAmount);
  const scale = Math.max(saved.scale, target.scale);
  const savedScaled = saved.unscaled * 10n ** BigInt(scale - saved.scale);
  const targetScaled = target.unscaled * 10n ** BigInt(scale - target.scale);

  if (targetScaled <= 0n) return 0;

  // Math.round와 동일하게 0.5 이상을 올림하되, 큰 금액도 정밀도를 잃지 않는다.
  const roundedRate = (savedScaled * 100n * 2n + targetScaled) / (targetScaled * 2n);
  return Number(roundedRate > 100n ? 100n : roundedRate);
};

UPDATE `intervention_questions`
SET
  `question_text` = CASE `sort_order`
    WHEN 1 THEN '혹시 이거, 이미 가지고 있진 않나요?'
    WHEN 2 THEN '이거, 지금 꼭 필요한 걸까요?'
    WHEN 3 THEN '비슷한 거, 최근에 산 적 있지 않나요?'
    ELSE `question_text`
  END,
  `risk_weight` = CASE `sort_order`
    WHEN 1 THEN 2
    WHEN 2 THEN 1
    WHEN 3 THEN 2
    ELSE `risk_weight`
  END
WHERE `sort_order` IN (1, 2, 3);

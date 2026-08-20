-- Normalize legacy 0-100 scores to the current 0-5 scale before enforcing the constraint.
UPDATE `consumption_records`
SET `risk_score` = CASE
  WHEN `risk_score` < 0 THEN 0
  WHEN `risk_score` > 5 THEN LEAST(5, GREATEST(0, ROUND(`risk_score` / 20)))
  ELSE `risk_score`
END
WHERE `risk_score` IS NOT NULL
  AND (`risk_score` < 0 OR `risk_score` > 5);

ALTER TABLE `consumption_records`
  ADD CONSTRAINT `consumption_records_risk_score_range_chk`
  CHECK (`risk_score` IS NULL OR (`risk_score` >= 0 AND `risk_score` <= 5));

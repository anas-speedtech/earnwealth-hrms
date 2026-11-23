-- Probation policy: every new joiner is in a 6-month probation period from
-- the date of joining, during which they may apply ONLY "Probation Leave".
-- The enforcement gate is code (LeaveService); this migration just makes sure
-- the PROBATION leave type exists so balances can be seeded for joiners.
--
-- Idempotent: skipped when a PROBATION row already exists.

INSERT INTO leave_types
  (id, name, displayName, description, code, classification, isHalfDayAllowed, isActive,
   annualEntitlementDays, isUnlimited, appliesToBoardLevel, createdAt, updatedAt)
SELECT
  'a1f0c9d2-55e0-4b3a-9c11-3f6e0b4d2a77',
  'PROBATION',
  'Probation Leave',
  'Leave applicable only during the 6-month probation period from the date of joining. This is the only leave type a probationer may apply for.',
  'PBL',
  'PAID',
  1,
  1,
  1,
  0,
  0,
  NOW(3),
  NOW(3)
WHERE NOT EXISTS (
  SELECT 1 FROM leave_types WHERE code = 'PBL' OR name = 'PROBATION'
);

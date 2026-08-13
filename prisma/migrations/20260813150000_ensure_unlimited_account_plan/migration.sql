UPDATE "User"
SET
  "unlimitedAccess" = true,
  "subscriptionPlan" = 'PRO',
  "subscriptionStatus" = 'ACTIVE',
  "subscriptionRequestedPlan" = NULL,
  "subscriptionCurrentPeriodEnd" = NULL,
  "subscriptionExpiryReminderSentAt" = NULL,
  "subscriptionExpiredEmailSentAt" = NULL
WHERE LOWER("email") = 'zaydelhaddad123@gmail.com';

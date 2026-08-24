import { Prisma } from '@prisma/client';

export const calculateWorkHoursNeeded = (price, hourlyWage) => {
  if (hourlyWage === null || hourlyWage === undefined || BigInt(hourlyWage) <= 0n) return null;
  return new Prisma.Decimal(price.toString()).dividedBy(hourlyWage.toString()).toDecimalPlaces(2);
};

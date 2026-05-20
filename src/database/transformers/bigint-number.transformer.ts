import type { ValueTransformer } from 'typeorm';

// Postgres bigint values come back as strings via node-postgres. Our IDs are
// safely below Number.MAX_SAFE_INTEGER (~9.007e15), so it's safe to coerce
// them to plain JS numbers for the response and Zod validation layer.
export const BigIntNumberTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null | undefined) =>
    value === null || value === undefined ? null : Number(value),
};

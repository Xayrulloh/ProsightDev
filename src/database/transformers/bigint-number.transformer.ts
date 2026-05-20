import type { ValueTransformer } from 'typeorm';

export const BigIntNumberTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null | undefined) =>
    value === null || value === undefined ? null : Number(value),
};

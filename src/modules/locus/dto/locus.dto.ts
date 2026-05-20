import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { LOCUS_SORT_FIELDS } from '../../../utils/constants';

const csvNumbers = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    const items = Array.isArray(v) ? v : v.split(',');
    const parsed = items.map((x) => Number(x)).filter((n) => Number.isFinite(n));
    return parsed.length ? parsed : undefined;
  });

const GetLocusQuerySchema = z.object({
  id: csvNumbers,
  assemblyId: z.string().optional(),
  regionId: csvNumbers,
  membershipStatus: z.string().optional(),
  sideload: z.enum(['locusMembers']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(1000),
  sortBy: z.enum(LOCUS_SORT_FIELDS).default('id'),
  sortOrder: z.enum(['ASC', 'DESC']).default('ASC'),
});

const LocusMemberResponseSchema = z.object({
  locusMemberId: z.number(),
  regionId: z.number(),
  locusId: z.number(),
  membershipStatus: z.string(),
});

const LocusItemResponseSchema = z.object({
  id: z.number(),
  assemblyId: z.string(),
  locusName: z.string(),
  publicLocusName: z.string(),
  chromosome: z.string(),
  strand: z.string(),
  locusStart: z.number(),
  locusStop: z.number(),
  memberCount: z.number(),
  ursTaxid: z.string().nullable().optional(),
  locusMembers: z.array(LocusMemberResponseSchema).optional(),
});

const LocusListResponseSchema = z.array(LocusItemResponseSchema);

class GetLocusQueryDto extends createZodDto(GetLocusQuerySchema) {}
class LocusItemResponseDto extends createZodDto(
  LocusItemResponseSchema,
) {}
class LocusListResponseDto extends createZodDto(
  LocusListResponseSchema,
) {}

export {
  GetLocusQuerySchema,
  LocusItemResponseSchema,
  LocusListResponseSchema,
  LocusMemberResponseSchema,
  GetLocusQueryDto,
  LocusItemResponseDto,
  LocusListResponseDto,
};

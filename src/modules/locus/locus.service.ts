import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import { LocusMember } from '../../database/entities/locus-member.entity';
import { Locus } from '../../database/entities/locus.entity';
import type { AuthenticatedUser } from '../../shared/types/authenticated-request';
import {
  LIMITED_ROLE_ALLOWED_REGION_IDS,
  UserRole,
} from '../../utils/constants';
import type { GetLocusQueryDto, LocusItemResponseDto } from './dto/locus.dto';

@Injectable()
export class LocusService {
  constructor(
    @InjectRepository(Locus)
    private readonly locusRepo: Repository<Locus>,
    @InjectRepository(LocusMember)
    private readonly memberRepo: Repository<LocusMember>,
  ) {}

  async findAll(
    query: GetLocusQueryDto,
    user: AuthenticatedUser,
  ): Promise<LocusItemResponseDto[]> {
    if (user.role === UserRole.NORMAL && query.sideload === 'locusMembers') {
      throw new ForbiddenException('Normal users cannot use sideloading');
    }

    const qb = this.locusRepo.createQueryBuilder('rl');

    if (Array.isArray(query.id) && query.id.length > 0) {
      qb.andWhere('rl.id IN (:...ids)', { ids: query.id });
    }

    if (query.assemblyId) {
      qb.andWhere('rl.assemblyId = :aid', { aid: query.assemblyId });
    }

    const hasRegionIdFilter =
      Array.isArray(query.regionId) && query.regionId.length > 0;

    const needsRlmFilter =
      hasRegionIdFilter ||
      !!query.membershipStatus ||
      user.role === UserRole.LIMITED;

    if (needsRlmFilter) {
      const sub = this.memberRepo
        .createQueryBuilder('rlm_sub')
        .select('1')
        .where('rlm_sub.locusId = rl.id');

      if (hasRegionIdFilter) {
        sub.andWhere('rlm_sub.regionId IN (:...rids)', {
          rids: query.regionId,
        });
      }

      if (query.membershipStatus) {
        sub.andWhere('rlm_sub.membershipStatus = :ms', {
          ms: query.membershipStatus,
        });
      }

      if (user.role === UserRole.LIMITED) {
        sub.andWhere('rlm_sub.regionId IN (:...allowed)', {
          allowed: [...LIMITED_ROLE_ALLOWED_REGION_IDS],
        });
      }

      qb.andWhere(`EXISTS (${sub.getQuery()})`).setParameters(
        sub.getParameters(),
      );
    }

    const sortFieldMap: Record<string, string> = {
      id: 'rl.id',
      locusName: 'rl.locusName',
      locusStart: 'rl.locusStart',
    };

    qb.orderBy(sortFieldMap[query.sortBy], query.sortOrder);
    qb.skip((query.page - 1) * query.pageSize).take(query.pageSize);

    const loci = await qb.getMany();

    if (query.sideload === 'locusMembers' && loci.length > 0) {
      const locusIds = loci.map((l) => l.id);

      const members = await this.memberRepo.find({
        where: { locusId: In(locusIds) },
      });

      const byLocus = new Map<number, LocusMember[]>();

      for (const m of members) {
        const arr = byLocus.get(m.locusId) ?? [];

        arr.push(m);
        byLocus.set(m.locusId, arr);
      }

      return loci.map((l) => {
        const groupedMembers = byLocus.get(l.id) ?? [];
        return {
          ...this.mapLocus(l),
          // ursTaxid lives on rnc_locus_members in the real schema; the spec
          // example surfaces it at the locus level when sideloading, so we
          // promote the first member's value.
          ursTaxid: groupedMembers[0]?.ursTaxid ?? null,
          locusMembers: groupedMembers.map((m) => ({
            locusMemberId: m.id,
            regionId: m.regionId,
            locusId: m.locusId,
            membershipStatus: m.membershipStatus,
          })),
        };
      });
    }

    return loci.map((l) => this.mapLocus(l));
  }

  private mapLocus(l: Locus): LocusItemResponseDto {
    return {
      id: l.id,
      assemblyId: l.assemblyId,
      locusName: l.locusName,
      publicLocusName: l.publicLocusName,
      chromosome: l.chromosome,
      strand: l.strand,
      locusStart: l.locusStart,
      locusStop: l.locusStop,
      memberCount: l.memberCount,
    };
  }
}

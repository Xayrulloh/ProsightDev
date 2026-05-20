import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type FindOptionsWhere, In, type Repository } from 'typeorm';
import { Locus } from '../../database/entities/locus.entity';
import { LocusMember } from '../../database/entities/locus-member.entity';
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

    // Resolve the effective regionId filter for this request. For a limited
    // user the allowlist is always applied, and any user-supplied regionId is
    // intersected with it. A disjoint intersection short-circuits to [].
    const effectiveRegionIds = this.resolveEffectiveRegionIds(query, user);
    if (effectiveRegionIds !== undefined && effectiveRegionIds.length === 0) {
      return [];
    }

    const qb = this.locusRepo.createQueryBuilder('rl');

    if (Array.isArray(query.id) && query.id.length > 0) {
      qb.andWhere('rl.id IN (:...ids)', { ids: query.id });
    }
    if (query.assemblyId) {
      qb.andWhere('rl.assemblyId = :aid', { aid: query.assemblyId });
    }

    const needsRlmFilter =
      (effectiveRegionIds?.length ?? 0) > 0 || !!query.membershipStatus;

    if (needsRlmFilter) {
      const sub = this.memberRepo
        .createQueryBuilder('rlm_sub')
        .select('1')
        .where('rlm_sub.locusId = rl.id');

      if (effectiveRegionIds?.length) {
        sub.andWhere('rlm_sub.regionId IN (:...rids)', {
          rids: effectiveRegionIds,
        });
      }
      if (query.membershipStatus) {
        sub.andWhere('rlm_sub.membershipStatus = :ms', {
          ms: query.membershipStatus,
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
      // Sideloaded members are filtered with the same parent-level filters so
      // the children mirror the parent query's intent (e.g. `membershipStatus=
      // member` returns only "member" rows, not all members of the matching
      // loci).
      const where: FindOptionsWhere<LocusMember> = { locusId: In(locusIds) };
      if (effectiveRegionIds?.length) {
        where.regionId = In(effectiveRegionIds);
      }
      if (query.membershipStatus) {
        where.membershipStatus = query.membershipStatus;
      }

      const members = await this.memberRepo.find({ where });
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

  private resolveEffectiveRegionIds(
    query: GetLocusQueryDto,
    user: AuthenticatedUser,
  ): number[] | undefined {
    const userRegionIds = Array.isArray(query.regionId) ? query.regionId : [];

    if (user.role === UserRole.LIMITED) {
      const allowed: number[] = [...LIMITED_ROLE_ALLOWED_REGION_IDS];
      return userRegionIds.length > 0
        ? userRegionIds.filter((id) => allowed.includes(id))
        : allowed;
    }

    return userRegionIds.length > 0 ? userRegionIds : undefined;
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

import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Locus } from '../../database/entities/locus.entity';
import { LocusMember } from '../../database/entities/locus-member.entity';
import {
  LIMITED_ROLE_ALLOWED_REGION_IDS,
  UserRole,
} from '../../utils/constants';
import { LocusService } from './locus.service';

type AnyQB = Record<string, jest.Mock>;

const makeQb = (): AnyQB => {
  const qb: AnyQB = {} as AnyQB;
  const chain = () => qb;

  qb.andWhere = jest.fn(chain);
  qb.orderBy = jest.fn(chain);
  qb.skip = jest.fn(chain);
  qb.take = jest.fn(chain);
  qb.select = jest.fn(chain);
  qb.where = jest.fn(chain);
  qb.setParameters = jest.fn(chain);
  qb.getQuery = jest.fn(() => '(SUB)');
  qb.getParameters = jest.fn(() => ({}));
  qb.getMany = jest.fn().mockResolvedValue([]);

  return qb;
};

const mkLocus = (id: number) => ({
  id,
  assemblyId: 'A',
  locusName: `name-${id}`,
  publicLocusName: `pub-${id}`,
  chromosome: '1',
  strand: '1',
  locusStart: 100,
  locusStop: 200,
  memberCount: 1,
});

const mkMember = (
  id: number,
  locusId: number,
  regionId = 1,
  ursTaxid: string | null = null,
) => ({
  id,
  ursTaxid,
  regionId,
  locusId,
  membershipStatus: 'member',
});

const baseQuery = {
  page: 1,
  pageSize: 1000,
  sortBy: 'id' as const,
  sortOrder: 'ASC' as const,
};

// biome-ignore lint/suspicious/noExplicitAny: tests intentionally cast partial DTO shapes
const asQuery = (obj: Record<string, unknown>) => obj as any;

const admin = { username: 'admin', role: UserRole.ADMIN };
const normal = { username: 'normal', role: UserRole.NORMAL };
const limited = { username: 'limited', role: UserRole.LIMITED };

describe('LocusService', () => {
  let service: LocusService;
  let locusQb: AnyQB;
  let memberQb: AnyQB;
  let memberFind: jest.Mock;

  const andWhereStrings = () =>
    locusQb.andWhere.mock.calls.map((c) => c[0] as string);

  beforeEach(async () => {
    locusQb = makeQb();
    memberQb = makeQb();

    memberFind = jest.fn().mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        LocusService,
        {
          provide: getRepositoryToken(Locus),
          useValue: { createQueryBuilder: jest.fn(() => locusQb) },
        },
        {
          provide: getRepositoryToken(LocusMember),
          useValue: {
            createQueryBuilder: jest.fn(() => memberQb),
            find: memberFind,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(LocusService);
  });

  // ---------------------------- role-based access ----------------------------
  describe('role-based access', () => {
    it('admin without rlm-touching filters: no EXISTS subquery', async () => {
      await service.findAll(asQuery(baseQuery), admin);
      expect(andWhereStrings().some((s) => s.startsWith('EXISTS'))).toBe(false);
    });

    it('normal without rlm-touching filters: no EXISTS subquery', async () => {
      await service.findAll(asQuery(baseQuery), normal);
      expect(andWhereStrings().some((s) => s.startsWith('EXISTS'))).toBe(false);
    });

    it('limited role always adds EXISTS subquery on rlm', async () => {
      await service.findAll(asQuery(baseQuery), limited);
      expect(andWhereStrings().some((s) => s.startsWith('EXISTS'))).toBe(true);
    });

    it('limited (no user regionId) subquery uses the allowlist as the rids', async () => {
      await service.findAll(asQuery(baseQuery), limited);

      const ridsCall = memberQb.andWhere.mock.calls.find(
        (c) => (c[1] as Record<string, unknown>)?.rids,
      );

      expect(ridsCall).toBeDefined();
      expect((ridsCall[1] as { rids: number[] }).rids).toEqual([
        ...LIMITED_ROLE_ALLOWED_REGION_IDS,
      ]);
    });

    it('normal + sideload throws ForbiddenException', async () => {
      await expect(
        service.findAll(
          asQuery({ ...baseQuery, sideload: 'locusMembers' }),
          normal,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('admin + sideload does NOT throw', async () => {
      await expect(
        service.findAll(
          asQuery({ ...baseQuery, sideload: 'locusMembers' }),
          admin,
        ),
      ).resolves.toEqual([]);
    });

    it('limited + sideload does NOT throw (still restricted by allowlist)', async () => {
      await expect(
        service.findAll(
          asQuery({ ...baseQuery, sideload: 'locusMembers' }),
          limited,
        ),
      ).resolves.toEqual([]);
    });
  });

  // ---------------------------- filtering ----------------------------
  describe('filtering', () => {
    it('id filter applied to rl.id IN (:...ids)', async () => {
      await service.findAll(asQuery({ ...baseQuery, id: [1, 2, 3] }), admin);

      const idCall = locusQb.andWhere.mock.calls.find((c) =>
        (c[0] as string).includes('rl.id IN'),
      );

      expect(idCall).toBeDefined();
      expect((idCall[1] as { ids: number[] }).ids).toEqual([1, 2, 3]);
    });

    it('assemblyId filter applied', async () => {
      await service.findAll(
        asQuery({ ...baseQuery, assemblyId: 'Rrox_v1' }),
        admin,
      );

      const aidCall = locusQb.andWhere.mock.calls.find((c) =>
        (c[0] as string).includes('assemblyId'),
      );

      expect(aidCall).toBeDefined();
      expect((aidCall[1] as { aid: string }).aid).toBe('Rrox_v1');
    });

    it('regionId filter triggers EXISTS subquery for admin', async () => {
      await service.findAll(asQuery({ ...baseQuery, regionId: [1, 2] }), admin);

      expect(andWhereStrings().some((s) => s.startsWith('EXISTS'))).toBe(true);

      const subCall = memberQb.andWhere.mock.calls.find(
        (c) => (c[1] as Record<string, unknown>)?.rids,
      );

      expect((subCall[1] as { rids: number[] }).rids).toEqual([1, 2]);
    });

    it('membershipStatus filter triggers EXISTS subquery for admin', async () => {
      await service.findAll(
        asQuery({ ...baseQuery, membershipStatus: 'member' }),
        admin,
      );

      expect(andWhereStrings().some((s) => s.startsWith('EXISTS'))).toBe(true);

      const subCall = memberQb.andWhere.mock.calls.find(
        (c) => (c[1] as Record<string, unknown>)?.ms,
      );

      expect((subCall[1] as { ms: string }).ms).toBe('member');
    });

    it('limited + user regionId in allowlist: subquery uses the intersection', async () => {
      const [firstAllowed] = LIMITED_ROLE_ALLOWED_REGION_IDS;

      await service.findAll(
        asQuery({ ...baseQuery, regionId: [firstAllowed, 99999] }),
        limited,
      );

      const ridsCall = memberQb.andWhere.mock.calls.find(
        (c) => (c[1] as Record<string, unknown>)?.rids,
      );

      expect((ridsCall[1] as { rids: number[] }).rids).toEqual([firstAllowed]);
    });

    it('limited + user regionId disjoint from allowlist: short-circuits without hitting DB', async () => {
      const res = await service.findAll(
        asQuery({ ...baseQuery, regionId: [99999] }),
        limited,
      );

      expect(res).toEqual([]);
      expect(locusQb.getMany).not.toHaveBeenCalled();
    });

    it('empty id array is ignored (no andWhere on rl.id)', async () => {
      await service.findAll(asQuery({ ...baseQuery, id: [] }), admin);

      const idCall = locusQb.andWhere.mock.calls.find((c) =>
        (c[0] as string).includes('rl.id IN'),
      );

      expect(idCall).toBeUndefined();
    });
  });

  // ---------------------------- sorting ----------------------------
  describe('sorting', () => {
    it('default sort is rl.id ASC', async () => {
      await service.findAll(asQuery(baseQuery), admin);

      expect(locusQb.orderBy).toHaveBeenCalledWith('rl.id', 'ASC');
    });

    it('sortBy=locusName sortOrder=DESC -> rl.locusName DESC', async () => {
      await service.findAll(
        asQuery({ ...baseQuery, sortBy: 'locusName', sortOrder: 'DESC' }),
        admin,
      );

      expect(locusQb.orderBy).toHaveBeenCalledWith('rl.locusName', 'DESC');
    });

    it('sortBy=locusStart sortOrder=ASC -> rl.locusStart ASC', async () => {
      await service.findAll(
        asQuery({ ...baseQuery, sortBy: 'locusStart' }),
        admin,
      );

      expect(locusQb.orderBy).toHaveBeenCalledWith('rl.locusStart', 'ASC');
    });
  });

  // ---------------------------- pagination ----------------------------
  describe('pagination', () => {
    it('default page=1 pageSize=1000 -> skip(0) take(1000)', async () => {
      await service.findAll(asQuery(baseQuery), admin);

      expect(locusQb.skip).toHaveBeenCalledWith(0);
      expect(locusQb.take).toHaveBeenCalledWith(1000);
    });

    it('page=3 pageSize=50 -> skip(100) take(50)', async () => {
      await service.findAll(
        asQuery({ ...baseQuery, page: 3, pageSize: 50 }),
        admin,
      );

      expect(locusQb.skip).toHaveBeenCalledWith(100);
      expect(locusQb.take).toHaveBeenCalledWith(50);
    });

    it('page=10 pageSize=20 -> skip(180) take(20)', async () => {
      await service.findAll(
        asQuery({ ...baseQuery, page: 10, pageSize: 20 }),
        admin,
      );

      expect(locusQb.skip).toHaveBeenCalledWith(180);
      expect(locusQb.take).toHaveBeenCalledWith(20);
    });
  });

  // ---------------------------- sideloading ----------------------------
  describe('sideloading', () => {
    it('admin sideload triggers a member-find query', async () => {
      locusQb.getMany.mockResolvedValueOnce([mkLocus(1), mkLocus(2)]);

      await service.findAll(
        asQuery({ ...baseQuery, sideload: 'locusMembers' }),
        admin,
      );

      expect(memberFind).toHaveBeenCalledTimes(1);
    });

    it('no sideload: no member-find query', async () => {
      locusQb.getMany.mockResolvedValueOnce([mkLocus(1)]);

      await service.findAll(asQuery(baseQuery), admin);

      expect(memberFind).not.toHaveBeenCalled();
    });

    it('sideload with empty rl result skips the member-find query', async () => {
      locusQb.getMany.mockResolvedValueOnce([]);

      await service.findAll(
        asQuery({ ...baseQuery, sideload: 'locusMembers' }),
        admin,
      );

      expect(memberFind).not.toHaveBeenCalled();
    });

    it('groups members by locusId in the response', async () => {
      locusQb.getMany.mockResolvedValueOnce([mkLocus(1), mkLocus(2)]);

      memberFind.mockResolvedValueOnce([
        mkMember(10, 1, 100),
        mkMember(11, 1, 200),
        mkMember(12, 2, 300),
      ]);

      const res = await service.findAll(
        asQuery({ ...baseQuery, sideload: 'locusMembers' }),
        admin,
      );

      expect(res[0].locusMembers).toHaveLength(2);
      expect(res[1].locusMembers).toHaveLength(1);
      expect(res[0].locusMembers?.[0].locusMemberId).toBe(10);
      expect(res[1].locusMembers?.[0].regionId).toBe(300);
    });

    it('loci without members get an empty locusMembers array when sideloading', async () => {
      locusQb.getMany.mockResolvedValueOnce([mkLocus(1), mkLocus(2)]);

      memberFind.mockResolvedValueOnce([mkMember(10, 1, 100)]);

      const res = await service.findAll(
        asQuery({ ...baseQuery, sideload: 'locusMembers' }),
        admin,
      );

      expect(res[1].locusMembers).toEqual([]);
    });

    it('sideload + membershipStatus: member-find receives the same status filter', async () => {
      locusQb.getMany.mockResolvedValueOnce([mkLocus(1)]);
      await service.findAll(
        asQuery({
          ...baseQuery,
          sideload: 'locusMembers',
          membershipStatus: 'member',
        }),
        admin,
      );
      const findArg = memberFind.mock.calls[0][0] as {
        where: { membershipStatus?: string };
      };
      expect(findArg.where.membershipStatus).toBe('member');
    });

    it('sideload + regionId: member-find receives the same regionId filter', async () => {
      locusQb.getMany.mockResolvedValueOnce([mkLocus(1)]);
      await service.findAll(
        asQuery({
          ...baseQuery,
          sideload: 'locusMembers',
          regionId: [42, 99],
        }),
        admin,
      );
      const findArg = memberFind.mock.calls[0][0] as {
        where: { regionId?: unknown };
      };
      expect(findArg.where.regionId).toBeDefined();
    });

    it('limited + sideload: member-find restricted to allowlist regionIds', async () => {
      locusQb.getMany.mockResolvedValueOnce([mkLocus(1)]);
      await service.findAll(
        asQuery({ ...baseQuery, sideload: 'locusMembers' }),
        limited,
      );
      const findArg = memberFind.mock.calls[0][0] as {
        where: { regionId?: unknown };
      };
      expect(findArg.where.regionId).toBeDefined();
    });
  });

  // ---------------------------- response shape ----------------------------
  describe('response shape', () => {
    it('maps entity fields to response correctly (no sideload, no ursTaxid)', async () => {
      locusQb.getMany.mockResolvedValueOnce([
        {
          id: 7,
          assemblyId: 'Rrox_v1',
          locusName: 'name',
          publicLocusName: 'pub',
          chromosome: 'X',
          strand: '-1',
          locusStart: 100,
          locusStop: 200,
          memberCount: 5,
        },
      ]);

      const res = await service.findAll(asQuery(baseQuery), admin);

      expect(res[0]).toEqual({
        id: 7,
        assemblyId: 'Rrox_v1',
        locusName: 'name',
        publicLocusName: 'pub',
        chromosome: 'X',
        strand: '-1',
        locusStart: 100,
        locusStop: 200,
        memberCount: 5,
      });

      expect(res[0]).not.toHaveProperty('ursTaxid');
    });

    it('sideload promotes first member ursTaxid to locus level', async () => {
      locusQb.getMany.mockResolvedValueOnce([mkLocus(1)]);

      memberFind.mockResolvedValueOnce([
        mkMember(10, 1, 100, 'URS0000A888AB_61622'),
        mkMember(11, 1, 200, 'URS0000B999CD_72733'),
      ]);

      const res = await service.findAll(
        asQuery({ ...baseQuery, sideload: 'locusMembers' }),
        admin,
      );

      expect(res[0].ursTaxid).toBe('URS0000A888AB_61622');
    });

    it('sideload with no members yields null ursTaxid at locus level', async () => {
      locusQb.getMany.mockResolvedValueOnce([mkLocus(1)]);

      memberFind.mockResolvedValueOnce([]);

      const res = await service.findAll(
        asQuery({ ...baseQuery, sideload: 'locusMembers' }),
        admin,
      );

      expect(res[0].ursTaxid).toBeNull();
    });

    it('empty result returns empty array', async () => {
      locusQb.getMany.mockResolvedValueOnce([]);

      const res = await service.findAll(asQuery(baseQuery), admin);

      expect(res).toEqual([]);
    });
  });
});

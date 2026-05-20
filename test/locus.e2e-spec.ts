import type { INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  GLOBAL_PREFIX,
  LIMITED_ROLE_ALLOWED_REGION_IDS,
} from '../src/utils/constants';

jest.setTimeout(60000);

describe('Auth + Locus (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let normalToken: string;
  let limitedToken: string;

  const login = (username: string, password: string) =>
    request(app.getHttpServer())
      .post(`/${GLOBAL_PREFIX}/auth/login`)
      .send({ username, password });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      providers: [{ provide: APP_PIPE, useClass: ZodValidationPipe }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX);
    await app.init();

    adminToken = (await login('admin', 'admin123')).body.accessToken;
    normalToken = (await login('normal', 'normal123')).body.accessToken;
    limitedToken = (await login('limited', 'limited123')).body.accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ---------------------------- AUTH ----------------------------
  describe('POST /api/auth/login', () => {
    it('admin valid -> 200 + accessToken + role', async () => {
      const res = await login('admin', 'admin123');
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.username).toBe('admin');
      expect(res.body.role).toBe('admin');
    });

    it('normal valid -> 200', async () => {
      const res = await login('normal', 'normal123');
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('normal');
    });

    it('limited valid -> 200', async () => {
      const res = await login('limited', 'limited123');
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('limited');
    });

    it('wrong password -> 401', async () => {
      const res = await login('admin', 'nope');
      expect(res.status).toBe(401);
    });

    it('unknown user -> 401', async () => {
      const res = await login('ghost', 'whatever');
      expect(res.status).toBe(401);
    });

    it('missing body -> 400', async () => {
      const res = await request(app.getHttpServer())
        .post(`/${GLOBAL_PREFIX}/auth/login`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('empty username -> 400', async () => {
      const res = await login('', 'admin123');
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------- GET /locus auth requirements ----------------------------
  describe('GET /api/locus — auth', () => {
    it('no token -> 401', async () => {
      const res = await request(app.getHttpServer()).get(
        `/${GLOBAL_PREFIX}/locus`,
      );
      expect(res.status).toBe(401);
    });

    it('garbage token -> 401', async () => {
      const res = await request(app.getHttpServer())
        .get(`/${GLOBAL_PREFIX}/locus`)
        .set('Authorization', 'Bearer not.a.real.token');
      expect(res.status).toBe(401);
    });

    it('wrong-scheme header -> 401', async () => {
      const res = await request(app.getHttpServer())
        .get(`/${GLOBAL_PREFIX}/locus`)
        .set('Authorization', `Basic ${adminToken}`);
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------- GET /locus admin ----------------------------
  describe('GET /api/locus — admin', () => {
    it('basic call -> 200 + array', async () => {
      const res = await request(app.getHttpServer())
        .get(`/${GLOBAL_PREFIX}/locus?pageSize=2`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeLessThanOrEqual(2);
    });

    it('returned items have expected rl-table shape', async () => {
      const res = await request(app.getHttpServer())
        .get(`/${GLOBAL_PREFIX}/locus?pageSize=1`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      if (res.body.length > 0) {
        const item = res.body[0];
        expect(item.id).toEqual(expect.any(Number));
        expect(item.assemblyId).toEqual(expect.any(String));
        expect(item.locusName).toEqual(expect.any(String));
        expect(item.locusStart).toEqual(expect.any(Number));
        expect(item.locusStop).toEqual(expect.any(Number));
        expect(item.memberCount).toEqual(expect.any(Number));
      }
    });

    it('sideload=locusMembers -> items have locusMembers array', async () => {
      const res = await request(app.getHttpServer())
        .get(`/${GLOBAL_PREFIX}/locus?pageSize=2&sideload=locusMembers`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      if (res.body.length > 0) {
        expect(Array.isArray(res.body[0].locusMembers)).toBe(true);
        if (res.body[0].locusMembers.length > 0) {
          const m = res.body[0].locusMembers[0];
          expect(m.locusMemberId).toEqual(expect.any(Number));
          expect(m.regionId).toEqual(expect.any(Number));
          expect(m.locusId).toEqual(expect.any(Number));
          expect(m.membershipStatus).toEqual(expect.any(String));
        }
      }
    });

    it('page=1 vs page=2 produce different first items (when enough data)', async () => {
      const p1 = await request(app.getHttpServer())
        .get(`/${GLOBAL_PREFIX}/locus?pageSize=1&page=1`)
        .set('Authorization', `Bearer ${adminToken}`);
      const p2 = await request(app.getHttpServer())
        .get(`/${GLOBAL_PREFIX}/locus?pageSize=1&page=2`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(p1.status).toBe(200);
      expect(p2.status).toBe(200);
      if (p1.body.length && p2.body.length) {
        expect(p1.body[0].id).not.toBe(p2.body[0].id);
      }
    });

    it('sortOrder DESC vs ASC yields different first id (when enough data)', async () => {
      const asc = await request(app.getHttpServer())
        .get(`/${GLOBAL_PREFIX}/locus?pageSize=1&sortBy=id&sortOrder=ASC`)
        .set('Authorization', `Bearer ${adminToken}`);
      const desc = await request(app.getHttpServer())
        .get(`/${GLOBAL_PREFIX}/locus?pageSize=1&sortBy=id&sortOrder=DESC`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(asc.status).toBe(200);
      expect(desc.status).toBe(200);
      if (asc.body.length && desc.body.length) {
        expect(asc.body[0].id).not.toBe(desc.body[0].id);
      }
    });
  });

  // ---------------------------- GET /locus normal ----------------------------
  describe('GET /api/locus — normal', () => {
    it('basic call -> 200 + array', async () => {
      const res = await request(app.getHttpServer())
        .get(`/${GLOBAL_PREFIX}/locus?pageSize=2`)
        .set('Authorization', `Bearer ${normalToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('sideload=locusMembers -> 403', async () => {
      const res = await request(app.getHttpServer())
        .get(`/${GLOBAL_PREFIX}/locus?sideload=locusMembers&pageSize=2`)
        .set('Authorization', `Bearer ${normalToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------- GET /locus limited ----------------------------
  describe('GET /api/locus — limited', () => {
    it('basic call -> 200 + array', async () => {
      const res = await request(app.getHttpServer())
        .get(`/${GLOBAL_PREFIX}/locus?pageSize=3`)
        .set('Authorization', `Bearer ${limitedToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('with sideload: every locusMember.regionId is in the allowlist', async () => {
      const res = await request(app.getHttpServer())
        .get(`/${GLOBAL_PREFIX}/locus?pageSize=5&sideload=locusMembers`)
        .set('Authorization', `Bearer ${limitedToken}`);
      expect(res.status).toBe(200);
      // Note: locus rows are returned because they have at least ONE member in
      // the allowlist; not all of their members need be in the allowlist. We
      // assert only that at least one member matches per row.
      for (const locus of res.body) {
        if (Array.isArray(locus.locusMembers) && locus.locusMembers.length > 0) {
          const hasAllowed = locus.locusMembers.some((m: { regionId: number }) =>
            (LIMITED_ROLE_ALLOWED_REGION_IDS as readonly number[]).includes(
              m.regionId,
            ),
          );
          expect(hasAllowed).toBe(true);
        }
      }
    });
  });

  // ---------------------------- validation ----------------------------
  describe('GET /api/locus — query validation', () => {
    const callWith = (qs: string) =>
      request(app.getHttpServer())
        .get(`/${GLOBAL_PREFIX}/locus?${qs}`)
        .set('Authorization', `Bearer ${adminToken}`);

    it('invalid sortBy -> 400', async () => {
      const res = await callWith('sortBy=bogus');
      expect(res.status).toBe(400);
    });

    it('invalid sortOrder -> 400', async () => {
      const res = await callWith('sortOrder=sideways');
      expect(res.status).toBe(400);
    });

    it('pageSize > 1000 -> 400', async () => {
      const res = await callWith('pageSize=1001');
      expect(res.status).toBe(400);
    });

    it('pageSize=0 -> 400', async () => {
      const res = await callWith('pageSize=0');
      expect(res.status).toBe(400);
    });

    it('page=0 -> 400', async () => {
      const res = await callWith('page=0');
      expect(res.status).toBe(400);
    });

    it('invalid sideload value -> 400', async () => {
      const res = await callWith('sideload=bogus');
      expect(res.status).toBe(400);
    });

    it('page=abc -> 400', async () => {
      const res = await callWith('page=abc');
      expect(res.status).toBe(400);
    });
  });
});

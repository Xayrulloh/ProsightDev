import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { UserRole } from '../../utils/constants';
import { AuthService } from './auth.service';
import type { LoginRequestDto } from './dto/auth.dto';

const loginAs = (username: string, password: string): LoginRequestDto => ({
  username,
  password,
});

describe('AuthService', () => {
  let service: AuthService;
  let jwtSign: jest.Mock;

  beforeEach(async () => {
    jwtSign = jest.fn().mockResolvedValue('signed.jwt.token');

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: { signAsync: jwtSign } },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('admin valid credentials -> accessToken + role admin', async () => {
    const res = await service.login(loginAs('admin', 'admin123'));

    expect(res.accessToken).toBe('signed.jwt.token');
    expect(res.username).toBe('admin');
    expect(res.role).toBe(UserRole.ADMIN);
  });

  it('normal valid credentials -> role normal', async () => {
    const res = await service.login(loginAs('normal', 'normal123'));
    expect(res.role).toBe(UserRole.NORMAL);
  });

  it('limited valid credentials -> role limited', async () => {
    const res = await service.login(loginAs('limited', 'limited123'));
    expect(res.role).toBe(UserRole.LIMITED);
  });

  it('unknown username -> UnauthorizedException', async () => {
    await expect(
      service.login(loginAs('ghost', 'whatever')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('wrong password -> UnauthorizedException', async () => {
    await expect(
      service.login(loginAs('admin', 'wrong')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('username is case-sensitive (Admin != admin)', async () => {
    await expect(
      service.login(loginAs('Admin', 'admin123')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('JWT payload contains sub, username, role', async () => {
    await service.login(loginAs('admin', 'admin123'));

    expect(jwtSign).toHaveBeenCalledWith({
      sub: 'admin',
      username: 'admin',
      role: UserRole.ADMIN,
    });
  });

  it('JWT not signed on failure', async () => {
    await expect(
      service.login(loginAs('admin', 'wrong')),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(jwtSign).not.toHaveBeenCalled();
  });
});

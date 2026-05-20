import { Injectable, UnauthorizedException } from '@nestjs/common';
// biome-ignore lint/style/useImportType: JwtService is a runtime DI token
import { JwtService } from '@nestjs/jwt';
import { SYSTEM_USERS } from '../../config/users/users.config';
import type { JwtPayload } from '../../shared/types/authenticated-request';
import type { LoginRequestDto, LoginResponseDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(dto: LoginRequestDto): Promise<LoginResponseDto> {
    const user = SYSTEM_USERS.find((u) => u.username === dto.username);

    if (!user || user.password !== dto.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.username,
      username: user.username,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return { accessToken, username: user.username, role: user.role };
  }
}

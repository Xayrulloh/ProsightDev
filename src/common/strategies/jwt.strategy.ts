import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: ConfigService is a runtime DI token
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { EnvType } from '../../config/env/env-validation';
import type {
  AuthenticatedUser,
  JwtPayload,
} from '../../shared/types/authenticated-request';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<EnvType>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    return { username: payload.username, role: payload.role };
  }
}

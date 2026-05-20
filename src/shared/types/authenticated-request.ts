import type { Request } from 'express';
import type { UserRole } from '../../utils/constants';

export interface AuthenticatedUser {
  username: string;
  role: UserRole;
}

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
}

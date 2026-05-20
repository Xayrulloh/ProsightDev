import { UserRole } from '../../utils/constants';

export interface SystemUser {
  username: string;
  password: string;
  role: UserRole;
}

export const SYSTEM_USERS: readonly SystemUser[] = [
  { username: 'admin', password: 'admin123', role: UserRole.ADMIN },
  { username: 'normal', password: 'normal123', role: UserRole.NORMAL },
  { username: 'limited', password: 'limited123', role: UserRole.LIMITED },
];

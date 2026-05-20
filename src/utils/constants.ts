export const GLOBAL_PREFIX = 'api';
export const CLIENT_URL = '*';

export const LIMITED_ROLE_ALLOWED_REGION_IDS = [
  86118093, 86696489, 88186467,
] as const;

export enum UserRole {
  ADMIN = 'admin',
  NORMAL = 'normal',
  LIMITED = 'limited',
}

export const LOCUS_SORT_FIELDS = ['id', 'locusName', 'locusStart'] as const;
export type LocusSortField = (typeof LOCUS_SORT_FIELDS)[number];

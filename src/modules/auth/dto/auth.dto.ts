import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserRole } from '../../../utils/constants';

const LoginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const LoginResponseSchema = z.object({
  accessToken: z.string(),
  username: z.string(),
  role: z.nativeEnum(UserRole),
});

class LoginRequestDto extends createZodDto(LoginRequestSchema) {}
class LoginResponseDto extends createZodDto(LoginResponseSchema) {}

export { LoginRequestSchema, LoginResponseSchema, LoginRequestDto, LoginResponseDto };

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { EnvType } from '../config/env/env-validation';
import { Locus } from './entities/locus.entity';
import { LocusMember } from './entities/locus-member.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvType>) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: [Locus, LocusMember],
        synchronize: false,
        logging: false,
        extra: {
          connectionTimeoutMillis: 10000,
        },
      }),
    }),
  ],
})
export class DatabaseModule {}

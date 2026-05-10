import { Module } from '@nestjs/common';
import { RedisService } from './redis.service.js';
import { RedisLockService } from './redis-lock.service.js';

@Module({
  providers: [RedisService, RedisLockService],
  exports: [RedisService, RedisLockService],
})
export class RedisModule {}

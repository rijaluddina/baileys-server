import { Module } from '@nestjs/common';
import { RedisModule } from '../../redis/redis.module.js';
import { RpcClientService } from './rpc-client.service.js';

@Module({
  imports: [RedisModule],
  providers: [RpcClientService],
  exports: [RpcClientService],
})
export class RpcModule {}
import { Module } from '@nestjs/common';
import { MiscService } from './misc.service.js';
import { MiscController } from './misc.controller.js';

@Module({
  controllers: [MiscController],
  providers: [MiscService],
  exports: [MiscService],
})
export class MiscModule {}

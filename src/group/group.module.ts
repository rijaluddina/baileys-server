import { Module } from '@nestjs/common';
import { GroupService } from './group.service.js';
import { GroupController } from './group.controller.js';

@Module({
  controllers: [GroupController],
  providers: [GroupService],
  exports: [GroupService],
})
export class GroupModule {}

import { Module } from '@nestjs/common';
import {
  CommunityController,
  CallController,
  CatalogController,
  BusinessController,
} from './planned.controller.js';

@Module({
  controllers: [
    CommunityController,
    CallController,
    CatalogController,
    BusinessController,
  ],
})
export class PlannedModule {}

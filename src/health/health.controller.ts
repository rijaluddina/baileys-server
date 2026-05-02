import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator.js';

interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

@Public()
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'baileys-server',
      timestamp: new Date().toISOString(),
    };
  }
}

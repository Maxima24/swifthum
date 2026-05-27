import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'swifthum-api', time: new Date().toISOString() };
  }

  @Public()
  @Get()
  root() {
    return { service: 'swifthum-api', docs: 'see BACKEND.md' };
  }
}

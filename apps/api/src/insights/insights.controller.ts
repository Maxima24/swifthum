import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/current-user.decorator';
import { InsightsService } from './insights.service';

@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('suggested-rules')
  suggestedRules(@CurrentUser() user: JwtPayload) {
    return this.insights.suggestedRules(user.sub);
  }
}

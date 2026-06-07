import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/current-user.decorator';
import { UsersService } from './users.service';
import { UpdatePreferencesDto } from './users.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePreferencesDto) {
    return this.users.updatePreferences(user.sub, dto);
  }

  /** Resolve a typed @handle to a SwiftHum user (for the pay-by-username confirm UI). */
  @Get('lookup')
  lookup(@Query('username') username?: string) {
    return this.users.lookupByUsername(username ?? '');
  }
}

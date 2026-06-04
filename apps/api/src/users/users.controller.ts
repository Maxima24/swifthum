import { Body, Controller, Patch } from '@nestjs/common';
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
}

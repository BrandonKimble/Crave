import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { UserService } from './user.service';
import { PublicUserProfileDto } from './dto/user-profile.dto';

@Controller('users')
export class PublicUserController {
  constructor(private readonly userService: UserService) {}

  @Get(':userId/profile')
  async getPublicProfile(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<PublicUserProfileDto> {
    return this.userService.getPublicProfile(userId);
  }
}

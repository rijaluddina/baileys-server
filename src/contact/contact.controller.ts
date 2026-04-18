import { Controller, Get, Post, Param, Body, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ContactService } from './contact.service.js';
import {
  CheckNumberDto,
  UpdateProfilePictureDto,
  UpdateProfileNameDto,
  UpdateProfileStatusDto,
} from './dto/contact.dto.js';

@ApiTags('Contact')
@ApiSecurity('x-api-key')
@Controller(':sessionId/contacts')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Get()
  @ApiOperation({ summary: 'Get all contacts (from database)' })
  @ApiParam({ name: 'sessionId' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name or JID' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Limit (default: 50)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Offset (default: 0)' })
  getContacts(
    @Param('sessionId') sessionId: string,
    @Query('search') search?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.contactService.getContacts(sessionId, search, limit, offset);
  }

  @Post('check')
  @ApiOperation({ summary: 'Check if numbers exist on WhatsApp' })
  @ApiParam({ name: 'sessionId' })
  checkNumber(@Param('sessionId') sessionId: string, @Body() dto: CheckNumberDto) {
    return this.contactService.checkNumberExists(sessionId, dto);
  }

  @Get(':jid/profile-picture')
  @ApiOperation({ summary: 'Get profile picture URL' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'jid' })
  @ApiQuery({ name: 'highRes', required: false })
  getProfilePicture(
    @Param('sessionId') sessionId: string,
    @Param('jid') jid: string,
    @Query('highRes') highRes?: string,
  ) {
    return this.contactService.getProfilePicture(sessionId, jid, highRes === 'true');
  }

  @Get(':jid/business-profile')
  @ApiOperation({ summary: 'Get business profile' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'jid' })
  getBusinessProfile(@Param('sessionId') sessionId: string, @Param('jid') jid: string) {
    return this.contactService.getBusinessProfile(sessionId, jid);
  }

  @Get(':jid/status')
  @ApiOperation({ summary: 'Get contact about/status' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'jid' })
  getStatus(@Param('sessionId') sessionId: string, @Param('jid') jid: string) {
    return this.contactService.getStatus(sessionId, jid);
  }

  @Post(':jid/block')
  @ApiOperation({ summary: 'Block a contact' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'jid' })
  block(@Param('sessionId') sessionId: string, @Param('jid') jid: string) {
    return this.contactService.blockContact(sessionId, jid);
  }

  @Post(':jid/unblock')
  @ApiOperation({ summary: 'Unblock a contact' })
  @ApiParam({ name: 'sessionId' })
  @ApiParam({ name: 'jid' })
  unblock(@Param('sessionId') sessionId: string, @Param('jid') jid: string) {
    return this.contactService.unblockContact(sessionId, jid);
  }

  @Post('profile/picture')
  @ApiOperation({ summary: 'Update own profile picture' })
  @ApiParam({ name: 'sessionId' })
  updateProfilePicture(@Param('sessionId') sessionId: string, @Body() dto: UpdateProfilePictureDto) {
    return this.contactService.updateProfilePicture(sessionId, dto);
  }

  @Post('profile/name')
  @ApiOperation({ summary: 'Update own profile name' })
  @ApiParam({ name: 'sessionId' })
  updateProfileName(@Param('sessionId') sessionId: string, @Body() dto: UpdateProfileNameDto) {
    return this.contactService.updateProfileName(sessionId, dto.name);
  }

  @Post('profile/status')
  @ApiOperation({ summary: 'Update own about/status text' })
  @ApiParam({ name: 'sessionId' })
  updateProfileStatus(@Param('sessionId') sessionId: string, @Body() dto: UpdateProfileStatusDto) {
    return this.contactService.updateProfileStatus(sessionId, dto.status);
  }
}

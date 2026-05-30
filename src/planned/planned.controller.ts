import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';

@ApiTags('Community')
@ApiSecurity('bearerAuth')
@Controller(':sessionId/communities')
export class CommunityController {
  @Get()
  @ApiOperation({ summary: '[PLANNED] List communities' })
  list() {
    throw new NotImplementedException('Feature not yet implemented');
  }
}

@ApiTags('Call')
@ApiSecurity('bearerAuth')
@Controller(':sessionId/calls')
export class CallController {
  @Get()
  @ApiOperation({ summary: '[PLANNED] List call events' })
  list() {
    throw new NotImplementedException('Feature not yet implemented');
  }
}

@ApiTags('Catalog')
@ApiSecurity('bearerAuth')
@Controller(':sessionId/catalog')
export class CatalogController {
  @Get()
  @ApiOperation({ summary: '[PLANNED] List product catalog' })
  list() {
    throw new NotImplementedException('Feature not yet implemented');
  }
}

@ApiTags('Business')
@ApiSecurity('bearerAuth')
@Controller(':sessionId/business')
export class BusinessController {
  @Get()
  @ApiOperation({ summary: '[PLANNED] Get business profile' })
  getProfile() {
    throw new NotImplementedException('Feature not yet implemented');
  }
}

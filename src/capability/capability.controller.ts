import { Controller, Get, Post, Delete, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiParam } from '@nestjs/swagger';
import { CapabilityService } from './capability.service.js';

@ApiTags('Capabilities')
@ApiSecurity('x-api-key')
@Controller('capabilities')
export class CapabilityController {
  constructor(private readonly capabilityService: CapabilityService) {}

  @Get(':sessionId')
  @ApiOperation({ summary: 'Get capabilities for a session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  async getCapabilities(
    @Param('sessionId') sessionId: string,
  ): Promise<string[]> {
    return this.capabilityService.getCapabilitiesForSession(sessionId);
  }

  @Post(':sessionId/:capabilityName')
  @ApiOperation({ summary: 'Enable a capability for a session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({
    name: 'capabilityName',
    description: 'Capability name (e.g., messaging.send)',
  })
  async enableCapability(
    @Param('sessionId') sessionId: string,
    @Param('capabilityName') capabilityName: string,
  ): Promise<{ success: boolean; capability: string }> {
    await this.capabilityService.enableCapability(sessionId, capabilityName);
    return { success: true, capability: capabilityName };
  }

  @Delete(':sessionId/:capabilityName')
  @ApiOperation({ summary: 'Disable a capability for a session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({
    name: 'capabilityName',
    description: 'Capability name (e.g., messaging.send)',
  })
  disableCapability(
    @Param('sessionId') sessionId: string,
    @Param('capabilityName') capabilityName: string,
  ): { success: boolean; capability: string } {
    this.capabilityService.disableCapability(sessionId, capabilityName);
    return { success: true, capability: capabilityName };
  }

  @Get(':sessionId/:capabilityName')
  @ApiOperation({ summary: 'Check if session has a capability' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({
    name: 'capabilityName',
    description: 'Capability name (e.g., messaging.send)',
  })
  async hasCapability(
    @Param('sessionId') sessionId: string,
    @Param('capabilityName') capabilityName: string,
  ): Promise<{ hasCapability: boolean }> {
    const has = await this.capabilityService.hasCapability(
      sessionId,
      capabilityName,
    );
    return { hasCapability: has };
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MediaService } from './media.service.js';
import { S3Service } from './s3.service.js';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.url'),
}));

describe('MediaService', () => {
  let service: MediaService;
  const generatePresignedUploadUrl = jest
    .fn()
    .mockResolvedValue('https://signed.url');
  const getObjectUrl = jest.fn().mockReturnValue('https://media.url');
  const deleteObject = jest.fn();

  const mockS3Service = {
    generatePresignedUploadUrl,
    getObjectUrl,
    deleteObject,
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue({
      enabled: true,
      maxFileSize: 67108864,
      bucket: 'test-bucket',
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: S3Service, useValue: mockS3Service },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initUpload', () => {
    it('should return upload ID, URL and media key', async () => {
      const result = await service.initUpload({
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
      });

      expect(result.uploadId).toBeDefined();
      expect(result.uploadUrl).toBe('https://signed.url');
      expect(result.mediaKey).toBeDefined();
      expect(generatePresignedUploadUrl).toHaveBeenCalled();
    });
  });

  describe('completeUpload', () => {
    it('should return media ID and URL', async () => {
      const initResult = await service.initUpload({
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
      });

      const result = service.completeUpload(initResult.uploadId);

      expect(result.mediaId).toBeDefined();
      expect(result.url).toBe('https://media.url');
    });

    it('should throw error for invalid upload ID', () => {
      expect(() => service.completeUpload('invalid-id')).toThrow(
        'Upload session not found or expired',
      );
    });
  });

  describe('streamUpload', () => {
    it('should return media ID and URL', async () => {
      const result = await service.streamUpload({
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
      });

      expect(result.mediaId).toBeDefined();
      expect(result.url).toBe('https://media.url');
    });
  });
});

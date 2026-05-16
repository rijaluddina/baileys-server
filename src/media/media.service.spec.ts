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
  let s3Service: jest.Mocked<S3Service>;

  const mockS3Service = {
    generatePresignedUploadUrl: jest
      .fn()
      .mockResolvedValue('https://signed.url'),
    getObjectUrl: jest.fn().mockResolvedValue('https://media.url'),
    deleteObject: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue({
      enabled: true,
      maxFileSize: 67108864,
      bucket: 'test-bucket',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: S3Service, useValue: mockS3Service },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
    s3Service = module.get(S3Service);
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
      expect(s3Service.generatePresignedUploadUrl).toHaveBeenCalled();
    });
  });

  describe('completeUpload', () => {
    it('should return media ID and URL', async () => {
      const initResult = await service.initUpload({
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
      });

      const result = await service.completeUpload(initResult.uploadId);

      expect(result.mediaId).toBeDefined();
      expect(result.url).toBe('https://media.url');
    });

    it('should throw error for invalid upload ID', async () => {
      await expect(service.completeUpload('invalid-id')).rejects.toThrow(
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

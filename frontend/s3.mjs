import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _client = null;

const getClient = () => {
  if (!_client) {
    _client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
};

const getBucket = () => {
  const b = process.env.AWS_S3_BUCKET;
  if (!b) throw new Error('AWS_S3_BUCKET env var not set.');
  return b;
};

export const s3Upload = async (key, buffer, contentType = 'application/pdf') => {
  await getClient().send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
};

export const s3PresignedUrl = async (key, expiresIn = 3600) => {
  const command = new GetObjectCommand({ Bucket: getBucket(), Key: key });
  return getSignedUrl(getClient(), command, { expiresIn });
};

export const s3Delete = async (key) => {
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
};

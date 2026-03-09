import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import type { StreamingBlobPayloadInputTypes } from "@smithy/types";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.ts";
import { SIGNED_URL_EXPIRY } from "../config/constants.ts";

export class StorageService {
    private client: S3Client;
    private bucket = env.R2_BUCKET_NAME

    constructor() {
        this.client = new S3Client({
            region: "auto",
            endpoint: env.R2_ENDPOINT, // Ex: https://<accountid>.r2.cloudflarestorage.com
            credentials: {
                accessKeyId: env.R2_ACCESS_KEY_ID,
                secretAccessKey: env.R2_SECRET_ACCESS_KEY,
            },
        });
    }

    async uploadFile(file: StreamingBlobPayloadInputTypes, fileName: string, mimeType: string): Promise<string> {
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: fileName,
            Body: file,
            ContentType: mimeType,
        });

        await this.client.send(command);
        return fileName; // Retornamos a chave (path) do arquivo
    }

    async getFileUrl(fileKey: string): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: fileKey,
        });

        return getSignedUrl(this.client, command, { expiresIn: SIGNED_URL_EXPIRY });
    }
}

/** Singleton — use este ao invés de `new StorageService()` */
export const storageService = new StorageService();
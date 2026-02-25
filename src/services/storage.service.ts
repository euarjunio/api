import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.ts"; // Certifique-se de ter as variáveis no seu env.ts

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

    async uploadFile(file: Buffer, fileName: string, mimeType: string): Promise<string> {
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

        // Gera uma URL assinada que expira em 1 hora (segurança para documentos)
        return getSignedUrl(this.client, command, { expiresIn: 3600 });
    }
}

/** Singleton — use este ao invés de `new StorageService()` */
export const storageService = new StorageService();
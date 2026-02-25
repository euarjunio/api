import { hash } from "argon2";
import { prisma } from "../src/lib/prisma.ts";

async function seed() {
    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@gmail.com";
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "123123";

    const userEmail = process.env.SEED_USER_EMAIL ?? "user@gmail.com";
    const userPassword = process.env.SEED_USER_PASSWORD ?? "123123";

    const [adminHash, userHash] = await Promise.all([
        hash(adminPassword),
        hash(userPassword),
    ]);

    const admin = await prisma.user.upsert({
        where: { email: adminEmail },
        update: { passwordHash: adminHash, role: "ADMIN" },
        create: { email: adminEmail, passwordHash: adminHash, role: "ADMIN" },
    });

    const user = await prisma.user.upsert({
        where: { email: userEmail },
        update: { passwordHash: userHash, role: "USER" },
        create: { email: userEmail, passwordHash: userHash, role: "USER" },
    });

    const merchantDocument = process.env.SEED_MERCHANT_DOCUMENT ?? "11144477735"; // CPF válido de exemplo

    const merchant = await prisma.merchant.upsert({
        where: { userId: user.id },
        update: {},
        create: {
            userId: user.id,
            name: "Loja Seed",
            email: "loja-seed@local.test",
            phone: "11999999999",
            document: merchantDocument,
            documentType: "CPF",
            status: "ACTIVE",
            kycStatus: "APPROVED",
            // Valores fake só pra destravar fluxos locais (sem bater no adquirente)
            acquirer: "transfeera",
            acquirerAccountId: `acc_seed_${user.id.slice(0, 8)}`,
            pixKeyId: `pix_seed_${user.id.slice(0, 8)}`,
            pixKey: `pix_seed_key_${user.id.slice(0, 8)}`,
            pixKeyType: "CHAVE_ALEATORIA",
            pixKeyStatus: "ACTIVE",
            feeMode: "FIXADO",
            feeAmount: 80
        },
    });

    const apiKey = await prisma.apikey.upsert({
        where: { value: process.env.SEED_API_KEY_VALUE ?? "lk_seed_local_key_0001" },
        update: { status: "ACTIVE", merchantId: merchant.id },
        create: {
            merchantId: merchant.id,
            name: "Seed Key",
            description: "API Key para testes locais",
            value: process.env.SEED_API_KEY_VALUE ?? "lk_seed_local_key_0001",
            status: "ACTIVE",
        },
    });

    console.log("Seed OK:");
    console.log({ admin: { id: admin.id, email: admin.email }, user: { id: user.id, email: user.email } });
    console.log({ merchant: { id: merchant.id, document: merchant.document }, apiKey: { id: apiKey.id, value: apiKey.value } });
}

seed()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
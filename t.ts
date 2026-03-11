import { prisma } from "./src/lib/prisma.ts";

async function main() {
    const pendingWebhook = await prisma.pendingWebhook.create({
        data: {
            eventId: "cashin-06728076-6391-4be8-afb7-d12408686716",
            object: "CashIn",
            payload: {
                object: "CashIn",
                data: {
                    txid: "60c0e98f14d6798aaec51679685c97a5",
                    value: 200,
                },
                account_id: null,
                id: "cashin-06728076-6391-4be8-afb7-d12408686716",
            },
            status: "PENDING",
            attempts: 0,
        },
    });

    console.log(pendingWebhook);
    await prisma.$disconnect();
}

main().catch(console.error);
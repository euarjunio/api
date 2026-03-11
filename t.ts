import { prisma } from "./src/lib/prisma.ts";


/*     const pendingWebhook = await prisma.pendingWebhook.create({
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
 
    console.log(pendingWebhook); */

/*  const CHARGE_ID = "06728076-6391-4be8-afb7-d12408686716"; // troque pela charge certa
 await prisma.$transaction(async (tx) => {
   await tx.ledger.deleteMany({ where: { chargeId: CHARGE_ID } });
   await tx.charges.update({
     where: { id: CHARGE_ID },
     data: { status: "PENDING", paidAt: null },
   });
   await tx.pendingWebhook.deleteMany({ where: { eventId: `settlement-${CHARGE_ID}` } });
 }); */

const MERCHANT_ID = "6558f2a2-fe42-4f5c-b92d-37974314f455"; // merchant da conta que ficou -0,50

async function main() {
    const entry = await prisma.ledger.create({
        data: {
            merchantId: MERCHANT_ID,
            amount: 50, // centavos = R$ 0,50
            type: "ADJUSTMENT",
            status: "AVAILABLE",
            description: "Ajuste: taxa FEE órfã após revert de CashIn",
            metadata: { reason: "fix_fee_revert" },
        },
    });
    console.log("Ajuste +R$0,50 criado:", entry.id);
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });

await prisma.$disconnect();

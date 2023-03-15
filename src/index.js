// noinspection JSUnusedGlobalSymbols

// https://stripe.com/docs/webhooks/signatures#verify-manually
// const webhook_endpoint_secret = "whsec_4279b220ceec22b94873693786cc2b4e09245da72a600ef264fbaf48c5a8fe74";

let webhook_url = "";  // will be fetched from environment variables
let default_avatar_url = "https://media.discordapp.net/attachments/261053355793580032/1084349163698929744/meme-boy-gets-paid-4140-196a182847d3123a0e377b1059e07ceb1x.png";
const webhook_message_template = {
    "content": "",
    "embeds": [
        {
            "title": "placeholder title",
            "description": "",
            "url": "https://theroundtable.gg",
            "color": 10616664,
            "fields": [
                {
                    "name": "yes",
                    "value": "1"
                },
                {
                    "name": "wwwww",
                    "value": "w2"
                }
            ],
            "footer": {
                "text": "nom nom nom money nom nom"
            },
            "timestamp": new Date(parseInt("0") * 1000).toISOString()
        }
    ],
    "username": "roundtable funding secured",
    "avatar_url": default_avatar_url,
    "attachments": []
}

// noinspection JSUnusedLocalSymbols,SpellCheckingInspection
export default {
    /**
     * env provided by cloudflare (most likely wrangler.toml or values manually set from dashboard)
     * @type {{STRIPE_KEY:string, donos:{}}} env
     */
    async scheduled(controller, env, ctx) {
        const baseQuery = 'https://api.stripe.com/v1/charges/search?query=status%3A\'succeeded\'';
        const options = {
            method: 'GET',
            headers: {
                Authorization: 'Basic ' + btoa(env.STRIPE_KEY + ":"),
            }
        };


        let resp = await fetch(baseQuery, options);
        /** @type {{object:string, data:[], has_more:boolean, next_page:string|null}} data */
        let data = await resp.json();

        // noinspection SpellCheckingInspection
        /** @type {[{livemode:boolean, metadata:{username:string}|{}, amount:number, currency:string, created:number}]} collectedData */
        let collectedData = JSON.parse(JSON.stringify(data.data)); // deep-copy

        console.log(collectedData.length);

        // follow pagination
        while (data.has_more) {
            resp = await fetch(baseQuery + "&" + new URLSearchParams({"page": data.next_page}), options)
            data = await resp.json();
            collectedData.push(...data.data);
        }

        let kvData = [];
        for (let charge of collectedData) {
            kvData.push({"name": charge.metadata.username ?? "unknown", "amount": charge.amount, "currency": charge.currency, "timestamp": charge.created});
        }

        await env.donos.put("donos", JSON.stringify(kvData));
    },

    async fetch(request, env, ctx) {
        // webhook handler
        const {pathname} = new URL(request.url);
        if (pathname !== "/webhook" || request.method !== "POST") {
            return new Response(null, {status: 404});
        }

        // ensure required environment variables are present.
        // set environment variables inside wrangler.toml in this project directory or set them directly on
        // cloudflare workers page (settings tab on the top, then variables tab on the left)
        webhook_message_template.avatar_url = env.DISCORD_WEBHOOK_AVATAR_URL ?? default_avatar_url;
        if (!("DISCORD_WEBHOOK_URL" in env) || env.DISCORD_WEBHOOK_URL.length === 0) {
            return new Response("This worker is misconfigured. Required environment variable(s) are missing.", {status: 500});
        }
        webhook_url = env.DISCORD_WEBHOOK_URL

        let event = await request.json();
        let webhook_message = JSON.parse(JSON.stringify(webhook_message_template)); // deep copy of template

        webhook_message.embeds[0].timestamp = new Date(parseInt(event.created) * 1000).toISOString();
        webhook_message.embeds[0].title = "Event type: " + event.type;
        webhook_message.embeds[0].url = "https://dashboard.stripe.com/events/" + event.id;

        switch (event.type) {
            case 'balance.available':
                const balanceAvailable = event.data.object;
                // Then define and call a function to handle the event balance.available
                webhook_message.embeds[0].fields.length = 0;
                for (const avail of balanceAvailable.available) {
                    console.log(avail);
                    webhook_message.embeds[0].fields.push({
                        "name": "Available balance (" + avail.currency + ")",
                        "value": "" + (avail.amount / 100).toFixed(2),
                    })
                }

                break;
            case 'charge.succeeded':
                const chargeSucceeded = event.data.object;
                // Then define and call a function to handle the event charge.succeeded
                webhook_message.embeds[0].url = "https://dashboard.stripe.com/payments/" + chargeSucceeded.id;

                webhook_message.embeds[0].fields.length = 0;
                webhook_message.embeds[0].fields.push({
                    "name": "Charge amount",
                    "value": "" + (chargeSucceeded.amount / 100).toFixed(2) + " " + chargeSucceeded.currency
                });
                webhook_message.embeds[0].fields.push({
                    "name": "Effective amount (-2.9% and -0.30USD)",
                    "value": "" + (0.971 * (chargeSucceeded.amount - 30) / 100).toFixed(2) + " " + chargeSucceeded.currency
                });
                webhook_message.embeds[0].fields.push({
                    "name": "Donor",
                    "value": chargeSucceeded.metadata.username ?? "unknown"
                });

                break;
            // case 'payment_intent.succeeded':
            //     const paymentIntentSucceeded = event.data.object;
            //     // Then define and call a function to handle the event payment_intent.succeeded
            //     webhook_message.embeds[0].fields.length = 0;
            //     webhook_message.embeds[0].fields.push({"name": "Charge amount", "value": "" + chargeSucceeded.amount + " " + chargeSucceeded.currency});
            //     webhook_message.embeds[0].fields.push({"name": "Donor", "value": chargeSucceeded.metadata.username ?? "unknown"});
            //     break;
            case 'payout.paid':
                const payoutPaid = event.data.object;
                // Then define and call a function to handle the event payout.paid
                webhook_message.embeds[0].fields.length = 0;
                webhook_message.embeds[0].fields.push({
                    "name": "Expected payout arrival date",
                    "value": "<t:" + payoutPaid.arrival_date + ":F>"
                });
                webhook_message.embeds[0].fields.push({
                    "name": "Payout amount",
                    "value": ((payoutPaid.amount ?? -100) / 100).toFixed(2)
                });
                break;
            // ... handle other event types
            default:
                // webhook_message.embeds.length = 0;
                // webhook_message.content = "Unknown event type " + event.type + " received, view details in dashboard.";
                return new Response(null);
        }

        await fetch(webhook_url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            redirect: "follow",
            body: JSON.stringify(webhook_message),
        });


        return new Response(null);
    },
};

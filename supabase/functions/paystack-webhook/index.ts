import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function verifyPaystackSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expectedHex = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return expectedHex === signature;
}

serve(async (req) => {
  try {
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!paystackSecret) return new Response("Missing secret", { status: 500 });

    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";
    const valid = await verifyPaystackSignature(rawBody, signature, paystackSecret);
    if (!valid) {
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(rawBody);
    if (event.event === "charge.success") {
      const tx = event.data;
      const supabase = createClient(supabaseUrl, serviceKey);
      const { data: order } = await supabase
        .from("orders")
        .select("*")
        .eq("paystack_reference", tx.reference)
        .single();

      if (order && tx.currency === "NGN" && Number(tx.amount) === Math.round(Number(order.total_ngn) * 100)) {
        if (!order.stock_deducted) {
          await supabase.rpc("deduct_inventory_on_payment", { p_order_id: order.id });
        }
        await supabase.from("payments").upsert({
          order_id: order.id,
          reference: tx.reference,
          amount_kobo: Number(tx.amount),
          currency: "NGN",
          status: "success",
          channel: tx.channel || "webhook",
          gateway_response: tx.gateway_response || "Approved",
          verified_at: new Date().toISOString(),
          raw_payload: tx,
        }, { onConflict: "reference" });
      }
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
});

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!paystackSecret) {
      return new Response(JSON.stringify({ error: "PAYSTACK_SECRET_KEY not configured" }), { status: 500, headers: corsHeaders });
    }

    const { reference } = await req.json();
    if (!reference) {
      return new Response(JSON.stringify({ error: "Missing transaction reference" }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: order } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("paystack_reference", reference)
      .single();

    if (!order) {
      return new Response(JSON.stringify({ error: "Order not found for reference" }), { status: 404, headers: corsHeaders });
    }

    // Verify directly with Paystack API
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${paystackSecret}` },
    });
    const verifyJson = await verifyRes.json();

    if (!verifyJson.status || !verifyJson.data) {
      return new Response(JSON.stringify({ verified: false, error: verifyJson.message }), { status: 400, headers: corsHeaders });
    }

    const tx = verifyJson.data;
    const expectedKobo = Math.round(Number(order.total_ngn) * 100);
    const matches =
      tx.status === "success" &&
      tx.currency === "NGN" &&
      Number(tx.amount) === expectedKobo &&
      tx.reference === reference;

    if (!matches) {
      const mappedStatus = tx.status === "abandoned" ? "abandoned" : "failed";
      await supabase.from("orders").update({ payment_status: mappedStatus }).eq("id", order.id);
      await supabase.from("payments").update({
        status: mappedStatus,
        gateway_response: tx.gateway_response || "",
        raw_payload: tx,
      }).eq("reference", reference);

      return new Response(JSON.stringify({ verified: false, status: mappedStatus, order }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotent atomic stock deduction + mark paid
    if (!order.stock_deducted) {
      await supabase.rpc("deduct_inventory_on_payment", { p_order_id: order.id });
    }

    await supabase.from("payments").upsert({
      order_id: order.id,
      reference,
      amount_kobo: expectedKobo,
      currency: "NGN",
      status: "success",
      channel: tx.channel || "card",
      gateway_response: tx.gateway_response || "Approved",
      verified_at: new Date().toISOString(),
      raw_payload: tx,
    }, { onConflict: "reference" });

    const { data: updatedOrder } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", order.id)
      .single();

    return new Response(JSON.stringify({ verified: true, status: "paid", order: updatedOrder }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});

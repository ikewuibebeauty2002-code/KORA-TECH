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

    const supabase = createClient(supabaseUrl, serviceKey);
    const { orderId, callbackUrl } = await req.json();

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), { status: 404, headers: corsHeaders });
    }

    const amountKobo = Math.round(Number(order.total_ngn) * 100);
    const reference = order.paystack_reference || `KT-${order.order_number}-${Date.now()}`;

    const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: order.customer_email,
        amount: amountKobo,
        currency: "NGN",
        reference,
        callback_url: callbackUrl,
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
          customer_name: order.customer_name,
        },
      }),
    });

    const psJson = await psRes.json();
    if (!psJson.status) {
      return new Response(JSON.stringify({ error: psJson.message || "Paystack initialization failed" }), { status: 400, headers: corsHeaders });
    }

    await supabase.from("orders").update({ paystack_reference: reference }).eq("id", order.id);
    await supabase.from("payments").upsert({
      order_id: order.id,
      reference,
      amount_kobo: amountKobo,
      currency: "NGN",
      status: "initialized",
      payment_method: "paystack",
    }, { onConflict: "reference" });

    return new Response(JSON.stringify({
      authorization_url: psJson.data.authorization_url,
      reference,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});

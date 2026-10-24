const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

export function retiredHandler(endpoint: string, replacement: string) {
  return (request: Request): Response => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    return new Response(JSON.stringify({
      error: {
        code: "endpoint_retired",
        message: `The ${endpoint} Edge Function is retired. ${replacement}`,
      },
    }), {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
  };
}

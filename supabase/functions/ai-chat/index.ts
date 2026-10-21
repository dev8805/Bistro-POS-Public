// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const DAILY_LIMIT = 100;
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_FALLBACK = "gemini-3.1-flash-lite";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DB_SCHEMA = `
Tablas (todas con business_id para filtrar por negocio):

1. orders: id, business_id, table_id, client_id, waiter_id, order_number (int), order_type (dine_in/takeaway/delivery), status (pending/preparing/ready/completed/canceled), payment_method (cash/card/nequi/daviplata/transfer/credit/other), payment_status (pending/paid/partial), subtotal, discount, tax, total (numeric - monto final cobrado), amount_paid, change_amount, notes, customer_name, created_at, completed_at, canceled_at

2. order_items: id, order_id, product_id, product_name, quantity, unit_price, total_price, notes, cooking_term, status (pending/preparing/ready/served/canceled), created_at

3. products: id, business_id, category_id, name, description, type (simple/processed/service), price (precio de venta), cost (costo de compra), stock, min_stock, unit, image_url, is_active, is_for_sale, nicknames (text[]), created_at

4. categories: id, business_id, name, description, color, display_order, is_active

5. clients: id, business_id, name, phone, email, address, credit_limit, current_debt, notes, is_active, id_number

6. client_transactions: id, client_id, type (debt/payment), amount, note, order_id, created_by, created_at

7. expenses: id, business_id, amount, description, category, payment_method, expense_date (date), created_by, created_at

8. fixed_expenses: id, business_id, name, amount, category, is_active

9. cash_shifts: id, business_id, register_id, opened_by, closed_by, opened_at, closed_at, opening_balance, expected_cash, declared_cash, difference, total_sales, total_cash_sales, total_card_sales, total_transfer_sales, total_credit_sales, total_expenses, total_cash_in, total_cash_out, orders_count, status (open/closed/reconciled), notes

10. cash_movements: id, shift_id, created_by, type (opening/cash_in/cash_out/sale/expense/refund/purchase), amount, description, reference_id, payment_method, created_at

11. inventory_lots: id, business_id, product_id, initial_quantity, remaining_quantity, unit_cost (costo unitario del lote), purchase_date, expiration_date, supplier_name, notes

12. lot_allocations: id, lot_id, order_item_id, quantity_allocated, unit_cost_at_sale (costo al momento de vender), created_at

13. tables: id, business_id, room_id, label, seats, status (available/occupied/reserved)

14. profiles: id, full_name, phone, role (Administrador/Cajero/Mesero/Cocinero), business_id

15. rooms: id, business_id, name, description

Relaciones:
- orders.table_id -> tables.id
- orders.client_id -> clients.id
- orders.waiter_id -> profiles.id
- order_items.order_id -> orders.id
- order_items.product_id -> products.id
- products.category_id -> categories.id
- inventory_lots.product_id -> products.id
- lot_allocations.lot_id -> inventory_lots.id
- lot_allocations.order_item_id -> order_items.id
- client_transactions.client_id -> clients.id
- cash_movements.shift_id -> cash_shifts.id
`;

const BUSINESS_LOGIC = `
DICCIONARIO DE CONCEPTOS DE NEGOCIO (usa estas definiciones para interpretar preguntas):

- "cuanto vendi" / "ventas" / "ingresos" = SUM(orders.total) WHERE status = 'completed'
- "ganancia bruta" = ventas - COGS
- "COGS" / "costo de mercancia" = SUM(lot_allocations.quantity_allocated * lot_allocations.unit_cost_at_sale) via JOINs con order_items y orders. Si no hay lot_allocations, usar SUM(order_items.quantity * products.cost)
- "utilidad real" / "ganancia neta" / "utilidad operativa" = ganancia bruta - gastos fijos - mermas - otros gastos
- "gastos fijos" = SUM(fixed_expenses.amount) WHERE is_active = true
- "mermas" = expenses WHERE category = 'merma'
- "otros gastos" = expenses WHERE category != 'merma'
- "ticket promedio" = SUM(orders.total) / COUNT(orders) WHERE status = 'completed'
- "producto que genera mas plata" / "mas rentable" = el que tiene mayor (ingreso - costo), es decir: SUM(oi.total_price) - SUM(oi.quantity * p.cost) agrupado por producto
- "producto mas vendido" = mayor SUM(order_items.quantity)
- "producto con mayor ingreso" = mayor SUM(order_items.total_price)
- "rotacion de inventario" = cantidad vendida / stock actual
- "dias de inventario" = stock / (ventas diarias promedio). Si no se vende, es infinito
- "stock bajo" / "bajo stock" = products WHERE stock <= min_stock AND stock > 0
- "sin stock" / "agotados" = products WHERE stock = 0 AND is_active = true
- "creditos" / "cuentas por cobrar" / "me deben" = SUM(clients.current_debt) WHERE current_debt > 0
- "mayor deudor" / "quien me debe mas" = clients ORDER BY current_debt DESC
- "punto de equilibrio" = gastos_fijos / margen_bruto_porcentaje
- "GMROI" = ganancia bruta / inventario a costo = (ventas - COGS) / SUM(products.stock * products.cost)
- "valor del inventario a costo" = SUM(products.stock * products.cost) WHERE is_active = true AND stock > 0
- "valor del inventario a venta" = SUM(products.stock * products.price) WHERE is_active = true AND stock > 0
- "metodos de pago" = orders agrupados por payment_method con SUM(total)
- "actividad por hora" = COUNT(orders) agrupados por EXTRACT(HOUR FROM created_at)
- "mesero" / "quien vendio mas" = orders agrupados por waiter_id JOIN profiles

IMPORTANTE:
- "genera mas plata" NO es lo mismo que "mas vendido". "Genera mas plata" = mayor ganancia neta (ingreso - costo).
- Siempre que pregunten por "ganancia" o "rentabilidad", calcula ingreso - costo.
- Para COGS preciso, prefiere lot_allocations si existen datos. Si no hay, usa products.cost como fallback.
- orders.total ya incluye descuentos e impuestos, es el monto final.
`;

function isSafeSQL(sql: string): boolean {
  const normalized = sql.toUpperCase().replace(/\s+/g, ' ').trim();
  const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE', 'EXECUTE', 'EXEC'];
  for (const keyword of forbidden) {
    const regex = new RegExp(`\\b${keyword}\\b`);
    if (regex.test(normalized)) return false;
  }
  if (!normalized.startsWith('SELECT')) return false;
  return true;
}

async function callGemini(prompt: string, model: string, maxTokens: number, thinkingLevel = "low"): Promise<string | null> {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + GEMINI_API_KEY;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        thinkingConfig: { thinking_level: thinkingLevel },
        maxOutputTokens: maxTokens
      }
    })
  });
  if (!res.ok) {
    console.error("[ai-chat] Gemini " + model + " error: " + res.status + " " + await res.text());
    return null;
  }
  const data = await res.json();
  const text = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || "";
  return text.trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const question = body.question;
    const businessId = body.businessId;
    const userId = body.userId;
    const timezone = body.timezone;
    const conversationHistory = body.conversationHistory || [];

    if (!question || !businessId) {
      return new Response(
        JSON.stringify({ error: "Faltan parametros: question y businessId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tz = timezone || 'America/Bogota';
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verificar limite diario
    const { data: countData } = await supabaseAdmin.rpc('get_ai_chat_count_today', {
      p_business_id: businessId
    });
    const todayCount = countData || 0;

    if (todayCount >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({
          answer: "Has alcanzado el limite de " + DAILY_LIMIT + " consultas diarias. El limite se reinicia a medianoche.",
          limitReached: true,
          dailyCount: todayCount,
          dailyLimit: DAILY_LIMIT
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[ai-chat] Pregunta: " + question);

    // Contexto de conversacion
    var conversationContext = "";
    if (conversationHistory.length > 0) {
      conversationContext = "\n\nCONVERSACION PREVIA:\n";
      var historySlice = conversationHistory.slice(-6);
      for (var i = 0; i < historySlice.length; i++) {
        var msg = historySlice[i];
        if (msg.role === 'user') {
          conversationContext += "Usuario: " + msg.content + "\n";
        } else if (msg.sql) {
          conversationContext += "SQL previo: " + msg.sql + "\n";
        }
      }
    }

    var sqlPrompt = "Eres un experto en SQL para PostgreSQL para un sistema POS de restaurante colombiano.\n\n" + DB_SCHEMA + "\n" + BUSINESS_LOGIC + conversationContext + "\n\nREGLAS SQL:\n1. SOLO SELECT.\n2. SIEMPRE filtra por business_id = '" + businessId + "'.\n3. Para order_items: JOIN orders para filtrar por business_id.\n4. Para client_transactions: JOIN clients.\n5. Para lot_allocations: JOIN inventory_lots.\n6. Para cash_movements: JOIN cash_shifts.\n7. Fechas relativas: (campo AT TIME ZONE '" + tz + "')::date. Hoy = (NOW() AT TIME ZONE '" + tz + "')::date.\n8. Ventas = orders WHERE status = 'completed'.\n9. LIMIT 50 si puede haber muchos resultados.\n10. FROM y WHERE siempre.\n11. Alias en espanol.\n12. ROUND(campo, 0) para montos.\n13. NUNCA $0, $1, etc.\n14. Usa el DICCIONARIO DE CONCEPTOS para interpretar la pregunta del usuario correctamente.\n15. Si la pregunta es ambigua, interpreta el significado mas probable segun el diccionario.\n\nPregunta: \"" + question + "\"\n\nResponde SOLO con SQL ejecutable. Sin markdown, sin backticks, sin explicaciones.";

    // Intentar con modelo principal, fallback si falla
    var usedModel = GEMINI_MODEL;
    var generatedSQL = await callGemini(sqlPrompt, GEMINI_MODEL, 1024, "low");
    if (!generatedSQL) {
      console.log("[ai-chat] Fallback a " + GEMINI_FALLBACK);
      usedModel = GEMINI_FALLBACK;
      generatedSQL = await callGemini(sqlPrompt, GEMINI_FALLBACK, 1024, "low");
    }

    if (!generatedSQL) {
      return new Response(
        JSON.stringify({ answer: "Error al conectar con la IA. Intenta de nuevo.", error: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    generatedSQL = generatedSQL.replace(/```sql\n?/gi, '').replace(/```\n?/g, '').replace(/;\s*$/, '').trim();
    console.log("[ai-chat] SQL (" + usedModel + "): " + generatedSQL);

    if (!isSafeSQL(generatedSQL)) {
      console.error("[ai-chat] SQL invalido");
      return new Response(
        JSON.stringify({ answer: "No pude generar una consulta segura para tu pregunta. Intenta reformularla.", error: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ejecutar SQL
    var { data: queryResult, error: queryError } = await supabaseAdmin.rpc('execute_readonly_query', {
      sql_query: generatedSQL
    });

    // Si el SQL falla, reintentar con fallback
    if (queryError && usedModel === GEMINI_MODEL) {
      console.log("[ai-chat] SQL fallo, reintentando con " + GEMINI_FALLBACK);
      var retrySQL = await callGemini(sqlPrompt, GEMINI_FALLBACK, 1024, "low");
      if (retrySQL) {
        retrySQL = retrySQL.replace(/```sql\n?/gi, '').replace(/```\n?/g, '').replace(/;\s*$/, '').trim();
        if (isSafeSQL(retrySQL)) {
          var retryResult = await supabaseAdmin.rpc('execute_readonly_query', { sql_query: retrySQL });
          if (!retryResult.error) {
            queryResult = retryResult.data;
            queryError = null;
            generatedSQL = retrySQL;
            usedModel = GEMINI_FALLBACK;
            console.log("[ai-chat] Fallback SQL exitoso");
          }
        }
      }
    }

    var resultError = queryError ? (queryError.message || JSON.stringify(queryError)) : null;

    // Formatear respuesta
    var formatContext = "";
    if (resultError) {
      formatContext = "Error en la consulta: " + resultError + "\nSugiere como reformular la pregunta.";
    } else if (!queryResult || (Array.isArray(queryResult) && queryResult.length === 0)) {
      formatContext = "Sin resultados. Informa que no se encontraron datos para ese criterio.";
    } else {
      formatContext = "Datos:\n" + JSON.stringify(queryResult, null, 2);
    }

    var formatPrompt = "Eres un asistente de datos para un sistema POS de restaurante en Colombia.\n\nPregunta: \"" + question + "\"\n\n" + formatContext + "\n\nREGLAS:\n1. Espanol. Directo. Sin saludos ni adulacion.\n2. Sin emojis.\n3. Montos: $1.234.567 (punto de miles, sin decimales).\n4. Listas con guiones (-).\n5. Sin terminos tecnicos (SQL, query, etc).\n6. Formal. Solo datos relevantes.\n7. Titulos con negritas (**titulo**).\n8. Sin frases motivacionales ni subjetivas.\n9. Solo responde lo preguntado.\n10. Si hay error, di que la consulta no pudo procesarse y sugiere reformular.";

    var answer = await callGemini(formatPrompt, usedModel, 2048, "low");
    if (!answer) {
      answer = await callGemini(formatPrompt, GEMINI_FALLBACK, 2048, "low");
    }
    if (!answer) {
      answer = queryResult && !resultError
        ? "Datos:\n" + JSON.stringify(queryResult, null, 2)
        : "Error al procesar. Intenta de nuevo.";
    }

    // Guardar en historial
    if (userId) {
      await supabaseAdmin.from('ai_chat_history').insert({
        business_id: businessId,
        user_id: userId,
        question: question,
        answer: answer,
        sql_query: generatedSQL
      });
    }

    console.log("[ai-chat] OK (" + usedModel + ")");

    return new Response(
      JSON.stringify({
        answer: answer,
        sql: generatedSQL,
        data: queryResult,
        dailyCount: todayCount + 1,
        dailyLimit: DAILY_LIMIT
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[ai-chat] Error: " + (err.message || String(err)));
    return new Response(
      JSON.stringify({ answer: "Error inesperado. Intenta de nuevo.", error: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

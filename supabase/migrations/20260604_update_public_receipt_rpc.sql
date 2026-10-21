-- Actualiza el RPC get_public_receipt para incluir campos de modificaciones en los items
-- (notes, cooking_term, removed_ingredients).
-- Esto permite que la pagina publica del comprobante (link compartido por WhatsApp)
-- muestre las modificaciones de cada producto.
-- Cambio aditivo: solo agrega 3 campos al bloque de items, el resto es identico.

CREATE OR REPLACE FUNCTION public.get_public_receipt(p_order_number integer, p_hash text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'display_number', o.display_number,
    'customer_name', o.customer_name,
    'customer_document', c.id_number,
    'subtotal', o.subtotal,
    'discount', o.discount,
    'total', o.total,
    'payment_method', o.payment_method,
    'split_payments', o.split_payments,
    'amount_paid', o.amount_paid,
    'change_amount', o.change_amount,
    'initial_abono', o.initial_abono,
    'initial_abono_method', o.initial_abono_method,
    'created_at', o.created_at,
    'items', (
      SELECT json_agg(json_build_object(
        'product_name', oi.product_name,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'total_price', oi.total_price,
        'discount', oi.discount,
        'discount_percent', oi.discount_percent,
        'sale_unit', COALESCE(p.unit, 'Unidad'),
        'notes', oi.notes,
        'cooking_term', oi.cooking_term,
        'removed_ingredients', oi.removed_ingredients
      ))
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
    ),
    'business', json_build_object(
      'name', b.name,
      'phone', b.phone,
      'address', b.address,
      'nit', b.nit,
      'receipt_business_name', b.receipt_business_name,
      'receipt_phone', b.receipt_phone,
      'receipt_address', b.receipt_address,
      'logo_url', b.logo_url
    )
  ) INTO result
  FROM orders o
  JOIN businesses b ON b.id = o.business_id
  LEFT JOIN clients c ON c.id = o.client_id
  WHERE o.order_number = p_order_number
    AND o.status = 'completed'
    AND LEFT(o.id::text, 6) = LOWER(p_hash)
  LIMIT 1;

  RETURN result;
END;
$function$;

-- RPC para cargar todos los datos iniciales de caja en un único viaje de red (1 solo roundtrip).
-- Reemplaza 5 consultas en cascada sucesivas por una sola respuesta JSON consolidada.
create or replace function public.get_cash_register_init_data(
  p_business_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_registers jsonb;
  v_active_shift jsonb;
  v_shift_id uuid;
  v_opening_balance numeric;
  v_occupied_registers jsonb;
  v_movements jsonb;
  v_balances jsonb;
  v_has_more boolean := false;
  v_mov_count int := 0;
begin
  -- 1. Cajas activas del negocio
  select coalesce(jsonb_agg(to_jsonb(cr) order by cr.created_at asc), '[]'::jsonb)
  into v_registers
  from public.cash_registers cr
  where cr.business_id = p_business_id and cr.is_active = true;

  -- 2. Turno activo del usuario
  select 
    cs.id,
    cs.opening_balance,
    to_jsonb(cs) || jsonb_build_object(
      'register', to_jsonb(cr),
      'opened_by_profile', jsonb_build_object('full_name', p.full_name)
    )
  into v_shift_id, v_opening_balance, v_active_shift
  from public.cash_shifts cs
  left join public.cash_registers cr on cr.id = cs.register_id
  left join public.profiles p on p.id = cs.opened_by
  where cs.business_id = p_business_id
    and cs.opened_by = p_user_id
    and cs.status = 'open'
  order by cs.opened_at desc
  limit 1;

  -- 3. Cajas ocupadas por otros cajeros
  select coalesce(jsonb_object_agg(cs.register_id::text, coalesce(p.full_name, 'Otro empleado')), '{}'::jsonb)
  into v_occupied_registers
  from public.cash_shifts cs
  left join public.profiles p on p.id = cs.opened_by
  where cs.business_id = p_business_id
    and cs.status = 'open'
    and cs.opened_by <> p_user_id;

  -- 4. Movimientos y Balances si hay turno activo
  if v_shift_id is not null then
    -- Movimientos (primeros 20)
    select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc), '[]'::jsonb)
    into v_movements
    from (
      select cm.id, cm.shift_id, cm.created_by, cm.type, cm.amount, cm.description, 
             cm.payment_method, cm.reference_id, cm.reference_type, cm.created_at
      from public.cash_movements cm
      where cm.shift_id = v_shift_id
      order by cm.created_at desc
      limit 20
    ) m;

    -- Cantidad de movimientos para has_more
    select count(*) into v_mov_count
    from (
      select 1 from public.cash_movements cm
      where cm.shift_id = v_shift_id
      limit 21
    ) c;
    v_has_more := (v_mov_count > 20);

    -- Balances acumulados por método de pago
    select jsonb_build_object(
      'cash', coalesce(v_opening_balance, 0) + coalesce(sum(case 
                when cm.type in ('cash_in', 'sale') and coalesce(cm.payment_method, 'cash') = 'cash' then cm.amount
                when cm.type in ('cash_out', 'expense', 'refund', 'purchase') and coalesce(cm.payment_method, 'cash') = 'cash' then -cm.amount
                else 0 end), 0),
      'nequi', coalesce(sum(case 
                when cm.type in ('cash_in', 'sale') and cm.payment_method = 'nequi' then cm.amount
                when cm.type in ('cash_out', 'expense', 'refund', 'purchase') and cm.payment_method = 'nequi' then -cm.amount
                else 0 end), 0),
      'daviplata', coalesce(sum(case 
                when cm.type in ('cash_in', 'sale') and cm.payment_method = 'daviplata' then cm.amount
                when cm.type in ('cash_out', 'expense', 'refund', 'purchase') and cm.payment_method = 'daviplata' then -cm.amount
                else 0 end), 0),
      'card', coalesce(sum(case 
                when cm.type in ('cash_in', 'sale') and cm.payment_method = 'card' then cm.amount
                when cm.type in ('cash_out', 'expense', 'refund', 'purchase') and cm.payment_method = 'card' then -cm.amount
                else 0 end), 0),
      'transfer', coalesce(sum(case 
                when cm.type in ('cash_in', 'sale') and cm.payment_method = 'transfer' then cm.amount
                when cm.type in ('cash_out', 'expense', 'refund', 'purchase') and cm.payment_method = 'transfer' then -cm.amount
                else 0 end), 0),
      'other', coalesce(sum(case 
                when cm.type in ('cash_in', 'sale') and cm.payment_method = 'other' then cm.amount
                when cm.type in ('cash_out', 'expense', 'refund', 'purchase') and cm.payment_method = 'other' then -cm.amount
                else 0 end), 0)
    )
    into v_balances
    from public.cash_movements cm
    where cm.shift_id = v_shift_id;
  else
    v_movements := '[]'::jsonb;
    v_balances := jsonb_build_object(
      'cash', 0, 'nequi', 0, 'daviplata', 0, 'card', 0, 'transfer', 0, 'other', 0
    );
  end if;

  return jsonb_build_object(
    'registers', v_registers,
    'active_shift', v_active_shift,
    'occupied_registers', v_occupied_registers,
    'movements', v_movements,
    'has_more_movements', v_has_more,
    'balances', v_balances
  );
end;
$$;

grant execute on function public.get_cash_register_init_data(uuid, uuid) to authenticated;
comment on function public.get_cash_register_init_data(uuid, uuid) is 'Carga todos los datos iniciales de caja (cajas, turno activo, movimientos y balances) en un solo viaje de red ultra optimizado.';

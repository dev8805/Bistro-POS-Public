-- Preferencia por negocio: habilitar el acceso rápido al ComandaLabelModal
-- desde el header del carrito (desktop MenuScreen + móvil/tablet PaymentScreen).
-- Cuando está desactivado, el botón no se muestra y el modal solo aparece
-- desde SuccessScreen/SuccessSidebar como antes.

alter table public.businesses
    add column if not exists comanda_label_shortcut_enabled boolean not null default true;

comment on column public.businesses.comanda_label_shortcut_enabled is 'Muestra el botón de acceso rápido al ComandaLabelModal en el header del carrito. true por defecto para negocios existentes.';

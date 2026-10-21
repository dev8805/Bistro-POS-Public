insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Ensure RLS is enabled (usually is for storage.objects)

-- Policy for public read access
create policy "Public Access"
on storage.objects for select
using ( bucket_id = 'product-images' );

-- Policy for authenticated uploads
create policy "Authenticated Upload"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'product-images' );

-- Policy for authenticated updates (if needed later)
create policy "Authenticated Update"
on storage.objects for update
to authenticated
using ( bucket_id = 'product-images' );

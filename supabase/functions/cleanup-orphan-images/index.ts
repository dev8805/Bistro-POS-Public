import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: products, error: prodError } = await supabaseAdmin
      .from('products')
      .select('image_url')
      .not('image_url', 'is', null);

    if (prodError) throw prodError;

    const usedPaths = new Set<string>();
    for (const p of products || []) {
      if (p.image_url) {
        const match = p.image_url.match(/\/product-images\/(.+)$/);
        if (match) usedPaths.add(match[1]);
      }
    }

    const { data: allObjects, error: listError } = await supabaseAdmin
      .storage
      .from('product-images')
      .list('d0ed0946-8416-4e6f-a2b8-ec2c967aa655', { limit: 1000 });

    if (listError) throw listError;

    const { data: subObjects } = await supabaseAdmin
      .storage
      .from('product-images')
      .list('d0ed0946-8416-4e6f-a2b8-ec2c967aa655/products', { limit: 1000 });

    const orphans: string[] = [];

    for (const file of allObjects || []) {
      if (!file.name || file.id === null) continue;
      const fullPath = `d0ed0946-8416-4e6f-a2b8-ec2c967aa655/${file.name}`;
      if (!usedPaths.has(fullPath)) {
        orphans.push(fullPath);
      }
    }

    for (const file of subObjects || []) {
      if (!file.name || file.id === null) continue;
      const fullPath = `d0ed0946-8416-4e6f-a2b8-ec2c967aa655/products/${file.name}`;
      if (!usedPaths.has(fullPath)) {
        orphans.push(fullPath);
      }
    }

    let deleted = 0;
    if (orphans.length > 0) {
      const { error: delError } = await supabaseAdmin
        .storage
        .from('product-images')
        .remove(orphans);
      
      if (delError) throw delError;
      deleted = orphans.length;
    }

    return new Response(JSON.stringify({
      total_in_storage: (allObjects?.length || 0) + (subObjects?.length || 0),
      used_by_products: usedPaths.size,
      orphans_found: orphans.length,
      orphans_deleted: deleted,
      orphan_paths: orphans
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
import relay from '../../netlify/functions/operations.mjs';
import { mirrorAuthoritativeReply, mirrorVerifiedAdminOrderPage } from '../../api/lib/firestoreOrderMirror.js';

// Cloudflare Pages runtime: secrets live on context.env, never in import.meta.env.
export async function onRequest({ request, env }) {
  // Reuse the same strict action list, origin check, request-size limits,
  // pinned Apps Script target and authorization source as the Vercel relay.
  const original = request.method === 'POST' ? await request.clone().text() : '';
  const upstreamResponse = await relay(request, { scriptUrl: env.AURORA_SCRIPT_POST_URL });
  if (!upstreamResponse.ok) return upstreamResponse;

  let mirrored = upstreamResponse;
  try {
    const payload = JSON.parse(original);
    const backend = await upstreamResponse.clone().json();
    if (payload.action === 'create_order' || payload.action === 'staff_mutate') {
      const outcome = await mirrorAuthoritativeReply(payload, backend, { env });
      mirrored = new Response(upstreamResponse.body, upstreamResponse);
      mirrored.headers.set('X-Aurora-Firebase-Mirror', outcome.status);
    } else if (payload.action === 'staff_orders' && payload.firebase_mirror_backfill === true) {
      const backfill = await mirrorVerifiedAdminOrderPage(payload, backend, { env });
      if (backfill) {
        mirrored = new Response(JSON.stringify({ ...backend, firebase_backfill: backfill }), {
          status: 200,
          headers: upstreamResponse.headers,
        });
        mirrored.headers.set('X-Aurora-Firebase-Mirror',
          backfill.configured ? (backfill.failed ? 'partial' : 'processed') : 'not_configured');
      }
    }
  } catch (error) {
    console.error('Cloudflare Firebase projection failed:',
      error instanceof Error ? error.message : 'unknown');
    // Never lose an already accepted Sheets order due to a mirror failure.
    mirrored = new Response(upstreamResponse.body, upstreamResponse);
    mirrored.headers.set('X-Aurora-Firebase-Mirror', 'failed');
  }
  return mirrored;
}

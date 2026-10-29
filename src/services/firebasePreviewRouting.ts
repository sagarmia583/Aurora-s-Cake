/**
 * Firebase migration previews are deliberately isolated from the normal
 * storefront. Do not activate these previews on Vercel or Netlify.
 */
export function isCloudflarePreviewHostname(hostname: string): boolean {
  const host=hostname.toLowerCase();
  return host.endsWith('.workers.dev') || host.endsWith('.pages.dev');
}
export function isFirebaseStaffPreviewRoute(
  hostname: string, search: string, pathname: string = '/'
): boolean {
  return isCloudflarePreviewHostname(hostname)
    && (pathname === '/firebase-staff-preview'
      || new URLSearchParams(search).get('firebase_staff_preview')==='1');
}

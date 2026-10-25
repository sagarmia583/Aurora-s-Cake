/** Public Google OAuth Web Client ID; never put the Client Secret in this repository. */
export const AURORA_GOOGLE_WEB_CLIENT_ID = "246617121730-fssfp59nlinltkfq0rccuud74rfpccum.apps.googleusercontent.com";

/** Netlify may override the public Client ID with a site-specific Web client. */
export function getAuroraGoogleClientId(): string {
  return (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined)?.trim() || AURORA_GOOGLE_WEB_CLIENT_ID;
}

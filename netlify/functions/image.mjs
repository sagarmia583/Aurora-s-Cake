/** Netlify route for the existing allowlisted Google Sheets public image API.
 * Reuses the hardened Cloudflare Pages handler; no extra datastore or service.
 */
import {onRequest} from '../../functions/api/image.js';
export default function publicImage(request){
  return onRequest({request,env:{AURORA_SCRIPT_POST_URL:process.env.AURORA_SCRIPT_POST_URL}});
}
export const config={path:'/api/image'};

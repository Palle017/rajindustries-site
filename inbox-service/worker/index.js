import { handleRequest } from './api.mjs';
import { assets } from './assets.mjs';
export default { fetch(request,env,ctx) { return handleRequest(request,env,ctx,assets); } };

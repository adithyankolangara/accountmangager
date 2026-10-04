import type { RequestAuth } from '../http/context';

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware when the request carries a valid session. */
      auth?: RequestAuth;
    }
  }
}

export {};

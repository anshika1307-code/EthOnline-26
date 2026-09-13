/**
 * Refuse a /check request BEFORE the x402 paywall sees it.
 *
 * Without this, the paywall answers an invalid body (a private address, too
 * many endpoints, not a URL) with 402 and a quote, and only the handler says
 * 400 after the buyer has signed. Nothing settles — a failed handler cancels
 * settlement — but the buyer was asked to pay for work we were always going to
 * refuse. Same parser as pricing and the handler, so the three can't disagree.
 */
import type { Request, Response, NextFunction } from 'express';
import { parseCheckRequest } from './metering';

export function rejectInvalidCheck(req: Request, res: Response, next: NextFunction) {
  const parsed = parseCheckRequest(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error, charged: false });
    return;
  }
  next();
}

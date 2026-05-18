import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq, isNull, and } from 'drizzle-orm';
import { db, outreachMessages } from '@desany/db';
import { logger } from './logger.js';

// 1x1 transparent GIF
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

function sendPixel(reply: FastifyReply): FastifyReply {
  return reply
    .header('Content-Type', 'image/gif')
    .header('Content-Length', String(TRANSPARENT_GIF.length))
    .header('Cache-Control', 'no-cache, no-store, must-revalidate, private, max-age=0')
    .header('Pragma', 'no-cache')
    .header('Expires', '0')
    .header('X-Content-Type-Options', 'nosniff')
    .send(TRANSPARENT_GIF);
}

export async function recordOpen(outreachId: number): Promise<void> {
  await db
    .update(outreachMessages)
    .set({ openedAt: new Date(), status: 'opened' })
    .where(and(
      eq(outreachMessages.id, outreachId),
      isNull(outreachMessages.openedAt),
    ));
}

export async function registerTrackingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ status: 'ok' }));

  app.get<{ Params: { id: string } }>(
    '/track/open/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const idRaw = request.params.id;
      const id = Number.parseInt(idRaw, 10);

      if (!Number.isFinite(id) || id <= 0) {
        logger.debug({ idRaw }, 'tracking pixel: invalid id, returning gif anyway');
        return sendPixel(reply);
      }

      try {
        await recordOpen(id);
        logger.debug({ outreachId: id }, 'tracking pixel: open recorded (or already opened)');
      } catch (err) {
        logger.error({ err, outreachId: id }, 'tracking pixel: db update failed, returning gif');
      }

      return sendPixel(reply);
    },
  );
}

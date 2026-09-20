import { Command } from 'commander';
import type { WebhookEventType, WebhookStatus } from '../operations/webhooks.js';
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  updateWebhook,
  webhookRequests,
} from '../operations/webhooks.js';
import { fail, output, outputEmpty } from './format.js';
import { requirePat } from './helpers.js';

const VALID_EVENT_TYPES = [
  'FILE_UPDATE',
  'FILE_DELETE',
  'FILE_VERSION_UPDATE',
  'LIBRARY_PUBLISH',
  'FILE_COMMENT',
  'PING',
] as const;

export function webhooksCommand(): Command {
  const webhooks = new Command('webhooks')
    .description('Manage team webhooks');

  webhooks
    .command('list <team-id>')
    .description('List webhooks for a team')
    .option('--json', 'Force JSON output')
    .action(async (teamId: string, options: { json?: boolean }) => {
      try {
        const config = requirePat();
        const result = await listWebhooks(config, { team_id: teamId });
        if (result.webhooks.length === 0) {
          outputEmpty(result, 'No webhooks found.', { ...options, collection: 'webhooks' });
          return;
        }
        output(result, { ...options, collection: 'webhooks' });
      } catch (e: any) {
        fail(e);
      }
    });

  webhooks
    .command('create <team-id>')
    .description('Create a webhook subscription for a team')
    .requiredOption('--event-type <type>', `Event type (${VALID_EVENT_TYPES.join(', ')})`)
    .requiredOption('--endpoint <url>', 'URL to receive webhook payloads')
    .requiredOption('--passcode <secret>', 'Secret for signature verification')
    .option('--description <text>', 'Webhook description')
    .option('--json', 'Force JSON output')
    .action(async (teamId: string, options: {
      eventType: string;
      endpoint: string;
      passcode: string;
      description?: string;
      json?: boolean;
    }) => {
      try {
        const config = requirePat();
        const result = await createWebhook(config, {
          team_id: teamId,
          event_type: options.eventType as WebhookEventType,
          endpoint: options.endpoint,
          passcode: options.passcode,
          description: options.description,
        });
        output(result, options);
      } catch (e: any) {
        fail(e);
      }
    });

  webhooks
    .command('update <webhook-id>')
    .description('Update a webhook')
    .option('--event-type <type>', `Event type (${VALID_EVENT_TYPES.join(', ')})`)
    .option('--endpoint <url>', 'URL to receive webhook payloads')
    .option('--passcode <secret>', 'Secret for signature verification')
    .option('--description <text>', 'Webhook description')
    .option('--status <status>', 'Webhook status (ACTIVE, PAUSED)')
    .option('--json', 'Force JSON output')
    .action(async (webhookId: string, options: {
      eventType?: string;
      endpoint?: string;
      passcode?: string;
      description?: string;
      status?: string;
      json?: boolean;
    }) => {
      try {
        const config = requirePat();
        const result = await updateWebhook(config, {
          webhook_id: webhookId,
          event_type: options.eventType as WebhookEventType | undefined,
          endpoint: options.endpoint,
          passcode: options.passcode,
          description: options.description,
          status: options.status as WebhookStatus | undefined,
        });
        output(result, options);
      } catch (e: any) {
        fail(e);
      }
    });

  webhooks
    .command('requests <webhook-id>')
    .description('List recent webhook delivery attempts (last 7 days)')
    .option('--json', 'Force JSON output')
    .action(async (webhookId: string, options: { json?: boolean }) => {
      try {
        const config = requirePat();
        const result = await webhookRequests(config, { webhook_id: webhookId });
        if (result.requests.length === 0) {
          outputEmpty(result, 'No webhook deliveries in the last 7 days.', { ...options, collection: 'requests' });
          return;
        }
        output(result, { ...options, collection: 'requests' });
      } catch (e: any) {
        fail(e);
      }
    });

  webhooks
    .command('delete <webhook-id>')
    .description('Delete a webhook')
    .option('--json', 'Force JSON output')
    .action(async (webhookId: string, options: { json?: boolean }) => {
      try {
        const config = requirePat();
        const { confirmAction } = await import('./helpers.js');
        if (!await confirmAction(`Delete webhook ${webhookId}?`)) {
          throw new Error('Cancelled. No changes made.');
        }
        await deleteWebhook(config, { webhook_id: webhookId });
        output({ deleted: webhookId }, options);
      } catch (e: any) {
        fail(e);
      }
    });

  return webhooks;
}

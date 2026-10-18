import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';
import {notificationUrl} from './notificationUrl.ts';

type NotificationRow = {
  id: string;
  user_id: string;
  household_id: string;
  title: string;
  body: string | null;
  action_tab: string | null;
  type: string;
  severity: string;
  created_at: string;
};
type SubscriptionRow = {
  id: string;
  user_id: string;
  household_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  enabled: boolean;
};

/** Constant-time comparison for the dispatch secret. */
function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a),
    y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return json({error: 'Missing server configuration'}, 500);
  const admin = createClient(supabaseUrl, serviceRole, {auth: {persistSession: false, autoRefreshToken: false}});

  const {data: dispatchSecret, error: dispatchError} = await admin.rpc('get_web_push_dispatch_secret');
  if (dispatchError || !dispatchSecret) return json({error: 'Dispatch authorization unavailable'}, 500);
  const providedSecret = req.headers.get('x-nh-dispatch-secret') || '';
  if (!sameSecret(providedSecret, String(dispatchSecret))) return json({error: 'Unauthorized'}, 401);

  const {error: autoError} = await admin.rpc('run_household_automation');
  if (autoError) console.error('automation', autoError.message);

  let {data: vapid, error: vapidError} = await admin.rpc('get_web_push_vapid');
  if (vapidError) {
    console.error('vapid', vapidError.message);
    return json({error: 'Push configuration unavailable'}, 500);
  }
  let details = Array.isArray(vapid) ? vapid[0] : vapid;
  if (!details?.public_key || !details?.private_key) {
    const generated = webpush.generateVAPIDKeys();
    const subject = 'https://sidneygordon1991-coder.github.io/nuestro-hogar/';
    const {error: createError} = await admin.rpc('ensure_web_push_vapid', {
      p_public_key: generated.publicKey,
      p_private_key: generated.privateKey,
      p_subject: subject
    });
    if (createError) {
      console.error('vapid create', createError.message);
      return json({error: 'Push configuration unavailable'}, 500);
    }
    const refreshed = await admin.rpc('get_web_push_vapid');
    if (refreshed.error) {
      console.error('vapid refresh', refreshed.error.message);
      return json({error: 'Push configuration unavailable'}, 500);
    }
    details = Array.isArray(refreshed.data) ? refreshed.data[0] : refreshed.data;
  }

  webpush.setVapidDetails(details.subject, details.public_key, details.private_key);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const {data: notifications, error: notificationError} = await admin
    .from('notifications')
    .select('id,user_id,household_id,title,body,action_tab,type,severity,created_at')
    .is('push_sent_at', null)
    .gte('created_at', since)
    .order('created_at', {ascending: true})
    .limit(100);
  if (notificationError) {
    console.error('notifications', notificationError.message);
    return json({error: 'Notification queue unavailable'}, 500);
  }
  if (!notifications?.length) return json({processed: 0, sent: 0, disabled: 0});

  const userIds = [...new Set((notifications as NotificationRow[]).map(n => n.user_id))];
  const {data: preferences, error: prefError} = await admin
    .from('notification_preferences')
    .select('household_id,user_id,browser_notifications')
    .in('user_id', userIds);
  if (prefError) {
    console.error('preferences', prefError.message);
    return json({error: 'Preferences unavailable'}, 500);
  }
  const enabledPrefs = new Set(
    (preferences || []).filter((p: any) => p.browser_notifications).map((p: any) => p.household_id + ':' + p.user_id)
  );

  const {data: subscriptions, error: subError} = await admin
    .from('push_subscriptions')
    .select('id,user_id,household_id,endpoint,p256dh,auth,enabled')
    .in('user_id', userIds)
    .eq('enabled', true);
  if (subError) {
    console.error('subscriptions', subError.message);
    return json({error: 'Subscriptions unavailable'}, 500);
  }

  const subs = (subscriptions || []) as SubscriptionRow[];
  let sent = 0,
    disabled = 0,
    skipped = 0;
  // Every notification gets a final decision. Rows that will never be pushed (push off, no device, no access) are
  // stamped too: otherwise the 100 oldest unsent rows block the queue for everyone for a week.
  const settled: string[] = [];
  const retryUntil = Date.now() - 6 * 60 * 60 * 1000;
  for (const notification of notifications as NotificationRow[]) {
    if (!enabledPrefs.has(notification.household_id + ':' + notification.user_id)) {
      settled.push(notification.id);
      skipped++;
      continue;
    }
    const userSubs = subs.filter(
      s => s.user_id === notification.user_id && s.household_id === notification.household_id && s.enabled
    );
    if (!userSubs.length) {
      settled.push(notification.id);
      skipped++;
      continue;
    }
    // Never push a notification to someone who lost access to its module (e.g. finance alerts to a teen).
    const {data: allowed, error: accessError} = await admin.rpc('notification_push_allowed', {
      p_household_id: notification.household_id,
      p_user_id: notification.user_id,
      p_action_tab: notification.action_tab || ''
    });
    if (accessError) {
      console.error('push access', notification.id, 'failed');
      continue;
    }
    if (allowed !== true) {
      settled.push(notification.id);
      skipped++;
      continue;
    }
    let delivered = false,
      transient = false;
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body || '',
      icon: '/nuestro-hogar/icon-premium-192.png',
      badge: '/nuestro-hogar/icon-premium-192.png',
      tag: 'nh-' + notification.id,
      data: {url: notificationUrl(notification.action_tab), notification_id: notification.id},
      severity: notification.severity,
      type: notification.type
    });
    for (const subscription of userSubs) {
      try {
        await webpush.sendNotification(
          {endpoint: subscription.endpoint, keys: {p256dh: subscription.p256dh, auth: subscription.auth}},
          payload,
          {TTL: 3600, urgency: notification.severity === 'danger' ? 'high' : 'normal'}
        );
        delivered = true;
        sent++;
      } catch (error: any) {
        const status = Number(error?.statusCode || 0);
        console.error('push', subscription.id, status, error?.message || String(error));
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').update({enabled: false}).eq('id', subscription.id);
          disabled++;
        } else transient = true;
      }
    }
    // Temporary push-service errors are retried for six hours, then the notice stays only in the app.
    if (delivered || !transient || new Date(notification.created_at).getTime() < retryUntil)
      settled.push(notification.id);
  }
  if (settled.length) {
    const {error: stampError} = await admin
      .from('notifications')
      .update({push_sent_at: new Date().toISOString()})
      .in('id', settled)
      .is('push_sent_at', null);
    if (stampError) console.error('push stamp failed');
  }
  return json({processed: notifications.length, sent, disabled, skipped});
});

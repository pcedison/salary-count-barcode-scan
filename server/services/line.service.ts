import crypto from 'crypto';
import { createLogger } from '../utils/logger';

const log = createLogger('line-service');

const LINE_TOKEN_ENDPOINT = 'https://api.line.me/oauth2/v2.1/token';
const LINE_PROFILE_ENDPOINT = 'https://api.line.me/v2/profile';
const LINE_AUTHORIZE_ENDPOINT = 'https://access.line.me/oauth2/v2.1/authorize';

function maskLineUserId(lineUserId: string): string {
  const normalized = lineUserId.trim();
  if (normalized.length <= 8) {
    return '***';
  }

  return `${normalized.slice(0, 4)}***${normalized.slice(-4)}`;
}

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

export function isLineConfigured(): boolean {
  return !!(
    process.env.LINE_LOGIN_CHANNEL_ID &&
    process.env.LINE_LOGIN_CHANNEL_SECRET &&
    process.env.LINE_LOGIN_CALLBACK_URL &&
    process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN &&
    process.env.LINE_MESSAGING_CHANNEL_SECRET
  );
}

export function getLineLoginUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINE_LOGIN_CHANNEL_ID!,
    redirect_uri: process.env.LINE_LOGIN_CALLBACK_URL!,
    state,
    scope: 'profile openid'
  });
  return `${LINE_AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<{ access_token: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.LINE_LOGIN_CALLBACK_URL!,
    client_id: process.env.LINE_LOGIN_CHANNEL_ID!,
    client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET!
  });

  const response = await fetch(LINE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LINE token exchange failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<{ access_token: string }>;
}

export async function getLineProfile(accessToken: string): Promise<LineProfile> {
  const response = await fetch(LINE_PROFILE_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`LINE profile fetch failed: ${response.status}`);
  }

  return response.json() as Promise<LineProfile>;
}

export function verifyWebhookSignature(body: Buffer, signature: string): boolean {
  const secret = process.env.LINE_MESSAGING_CHANNEL_SECRET;
  if (!secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64');

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function getMessagingClient() {
  const { messagingApi } = await import('@line/bot-sdk');
  return new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN!
  });
}

export async function pushMessage(lineUserId: string, message: string): Promise<void> {
  try {
    const client = await getMessagingClient();
    await client.pushMessage({
      to: lineUserId,
      messages: [{ type: 'text', text: message }]
    });
  } catch (err) {
    log.warn(`LINE push message failed for ${maskLineUserId(lineUserId)}:`, err);
  }
}

export async function sendClockInNotification(
  lineUserId: string,
  employeeName: string,
  clockTime: string,
  isClockIn: boolean
): Promise<void> {
  const emoji = isClockIn ? '🌅' : '🌙';
  const action = isClockIn ? '上班打卡' : '下班打卡';
  const message = `${emoji} 打卡成功！\n\n👤 員工：${employeeName}\n📋 類型：${action}\n🕐 時間：${clockTime}\n\n祝您工作順利！`;
  await pushMessage(lineUserId, message);
}

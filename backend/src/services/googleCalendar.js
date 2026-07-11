import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { supabase, unwrap } from '../db/supabase.js';
import { encrypt, decryptJSON } from './crypto.js';

// ════════════════════════════════════════════════
// Integração REAL com o Google Calendar (OAuth2)
// ════════════════════════════════════════════════

/** Retorna { clientId, clientSecret } do tenant, ou cai para as ENVs globais. */
async function getTenantOAuthConfig(tenantId) {
  if (tenantId) {
    const rows = unwrap(
      await supabase.from('integrations')
        .select('meta')
        .eq('tenant_id', tenantId)
        .eq('provider', 'google_calendar')
        .limit(1)
    );
    const setup = rows?.[0]?.meta?.setup;
    if (setup?.client_id && setup?.client_secret_enc) {
      return {
        clientId: setup.client_id,
        clientSecret: decryptJSON(setup.client_secret_enc),
      };
    }
  }
  if (!config.google.clientId || !config.google.clientSecret) {
    throw new Error(
      'Google OAuth não configurado. Insira suas credenciais na página de Integrações ou defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env.'
    );
  }
  return { clientId: config.google.clientId, clientSecret: config.google.clientSecret };
}

async function makeOAuthClientForTenant(tenantId) {
  const { clientId, clientSecret } = await getTenantOAuthConfig(tenantId);
  return new google.auth.OAuth2(clientId, clientSecret, config.google.redirectUri);
}

/** Gera a URL de consentimento. O state é um JWT assinado (previne CSRF). */
export async function getAuthUrl(tenantId) {
  const oauth2 = await makeOAuthClientForTenant(tenantId);
  const state = jwt.sign({ tenantId }, config.jwt.secret, { expiresIn: '10m' });
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: config.google.scopes,
    state,
  });
}

/** Troca o code por tokens e persiste (criptografado) em integrations. */
export async function handleCallback(code, tenantId) {
  const oauth2 = await makeOAuthClientForTenant(tenantId);
  const { tokens } = await oauth2.getToken(code);

  oauth2.setCredentials(tokens);
  const cal = google.calendar({ version: 'v3', auth: oauth2 });
  let primaryEmail = null;
  try {
    const { data } = await cal.calendarList.get({ calendarId: 'primary' });
    primaryEmail = data.id || null;
  } catch { /* ignora */ }

  // Preserva meta.setup (credenciais OAuth do tenant) ao fazer upsert
  const existing = unwrap(
    await supabase.from('integrations')
      .select('meta')
      .eq('tenant_id', tenantId).eq('provider', 'google_calendar').limit(1)
  );
  const existingMeta = existing?.[0]?.meta || {};

  unwrap(
    await supabase.from('integrations').upsert({
      tenant_id: tenantId,
      provider: 'google_calendar',
      status: 'connected',
      credentials: encrypt(tokens),
      meta: { ...existingMeta, calendarId: 'primary', email: primaryEmail },
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,provider' })
  );

  return { connected: true, email: primaryEmail };
}

/** Client autenticado para o tenant, com auto-refresh persistido. */
export async function getCalendarClient(tenantId) {
  const rows = unwrap(
    await supabase.from('integrations')
      .select('credentials, meta, status')
      .eq('tenant_id', tenantId).eq('provider', 'google_calendar').limit(1)
  );
  const row = rows?.[0];
  if (!row || row.status !== 'connected') {
    throw new Error('Google Calendar não conectado para este cliente.');
  }

  const tokens = decryptJSON(row.credentials);
  const oauth2 = await makeOAuthClientForTenant(tenantId);
  oauth2.setCredentials(tokens);

  // re-salva tokens renovados
  oauth2.on('tokens', async (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    try {
      await supabase.from('integrations')
        .update({ credentials: encrypt(merged), updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId).eq('provider', 'google_calendar');
    } catch (e) {
      console.error('[google] falha ao re-salvar tokens:', e.message);
    }
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2 });
  const calendarId = row.meta?.calendarId || 'primary';
  return { calendar, calendarId };
}

/** Cria um evento com Google Meet automático. */
export async function createEvent(tenantId, { summary, description, start, end, attendees = [], timeZone = 'America/Sao_Paulo' }) {
  const { calendar, calendarId } = await getCalendarClient(tenantId);
  const { data } = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: 1,
    sendUpdates: 'all',
    requestBody: {
      summary,
      description,
      start: { dateTime: new Date(start).toISOString(), timeZone },
      end: { dateTime: new Date(end).toISOString(), timeZone },
      attendees: attendees.map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: `sdr-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    },
  });
  return {
    externalId: data.id,
    htmlLink: data.htmlLink,
    meetingLink: data.hangoutLink || data.conferenceData?.entryPoints?.[0]?.uri || null,
    status: data.status,
  };
}

/** Atualiza horário (e opcionalmente título) de um evento existente. */
export async function updateEvent(tenantId, externalId, { summary, start, end, timeZone = 'America/Sao_Paulo' } = {}) {
  const { calendar, calendarId } = await getCalendarClient(tenantId);
  const requestBody = {};
  if (summary) requestBody.summary = summary;
  if (start) requestBody.start = { dateTime: new Date(start).toISOString(), timeZone };
  if (end) requestBody.end = { dateTime: new Date(end).toISOString(), timeZone };
  const { data } = await calendar.events.patch({
    calendarId,
    eventId: externalId,
    sendUpdates: 'all',
    requestBody,
  });
  return {
    externalId: data.id,
    meetingLink: data.hangoutLink || data.conferenceData?.entryPoints?.[0]?.uri || null,
    status: data.status,
  };
}

/** Lista eventos num intervalo. */
export async function listEvents(tenantId, { timeMin, timeMax, maxResults = 50, showDeleted = false } = {}) {
  const { calendar, calendarId } = await getCalendarClient(tenantId);
  const { data } = await calendar.events.list({
    calendarId,
    timeMin: timeMin ? new Date(timeMin).toISOString() : new Date().toISOString(),
    timeMax: timeMax ? new Date(timeMax).toISOString() : undefined,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
    showDeleted,
  });
  return (data.items || []).map((e) => ({
    externalId: e.id,
    title: e.summary,
    // bare date (all-day) → append T12:00:00 so JS parses as local noon, not UTC midnight
    start: e.start?.dateTime || (e.start?.date ? e.start.date + 'T12:00:00' : null),
    end:   e.end?.dateTime   || (e.end?.date   ? e.end.date   + 'T12:00:00' : null),
    meetingLink: e.hangoutLink || null,
    status: e.status,
  }));
}

/** Cancela (deleta) um evento. */
export async function cancelEvent(tenantId, externalId) {
  const { calendar, calendarId } = await getCalendarClient(tenantId);
  await calendar.events.delete({ calendarId, eventId: externalId, sendUpdates: 'all' });
  return { cancelled: true };
}

/** Free/busy para a IA propor slots. */
export async function getFreeBusy(tenantId, { timeMin, timeMax, timeZone = 'America/Sao_Paulo' }) {
  const { calendar, calendarId } = await getCalendarClient(tenantId);
  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: new Date(timeMin).toISOString(),
      timeMax: new Date(timeMax).toISOString(),
      timeZone,
      items: [{ id: calendarId }],
    },
  });
  return data.calendars?.[calendarId]?.busy || [];
}

/** Desconecta o Google Calendar do tenant. */
export async function disconnect(tenantId) {
  unwrap(
    await supabase.from('integrations')
      .update({ status: 'disconnected', credentials: null, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId).eq('provider', 'google_calendar')
  );
  return { disconnected: true };
}

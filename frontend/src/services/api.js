import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const TOKEN_KEY = 'sdr_token'
const USER_KEY = 'sdr_user'

// Token só fica em sessionStorage para sessões de impersonação por aba.
// Login normal usa httpOnly cookie gerenciado pelo backend.
function getToken() {
  return sessionStorage.getItem(TOKEN_KEY)
}

export const http = axios.create({ baseURL: API_BASE, withCredentials: true })

// injeta Bearer token apenas quando há uma sessão de impersonação ativa
http.interceptors.request.use((cfg) => {
  const token = getToken()
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// normaliza erros (o backend devolve { error })
http.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.error || err.message || 'Erro de rede'
    if (err.response?.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    }
    return Promise.reject(new Error(msg))
  }
)

export const tokenStore = {
  get: getToken,
  // token de login normal não vai mais para localStorage — fica no httpOnly cookie
  set: (_v) => {},
  setSession: (v) => (v ? sessionStorage.setItem(TOKEN_KEY, v) : sessionStorage.removeItem(TOKEN_KEY)),
}

// ─── Endpoints (espelham o backend Express existente) ───
export const api = {
  // auth
  login: (email, password) =>
    http.post('/auth/login', { email, password }).then((r) => r.data),
  register: (name, companyName, email, password) =>
    http.post('/auth/register', { name, companyName, email, password }).then((r) => r.data),
  logout: () => http.post('/auth/logout').then((r) => r.data),

  // leads
  listLeads: () => http.get('/leads').then((r) => r.data.leads),
  createLead: (payload) => http.post('/leads', payload).then((r) => r.data.lead),
  updateLead: (id, payload) => http.patch(`/leads/${id}`, payload).then((r) => r.data.lead),
  deleteLead: (id) => http.delete(`/leads/${id}`).then((r) => r.data),
  leadMessages: (id) => http.get(`/leads/${id}/messages`).then((r) => r.data.messages),
  analyzeLead: (id) => http.post(`/leads/${id}/analyze`).then((r) => r.data),

  // appointments
  listAppointments: () => http.get('/appointments').then((r) => r.data.appointments),
  syncAppointments: () => http.post('/appointments/sync').then((r) => r.data),
  createAppointment: (payload) =>
    http.post('/appointments', payload).then((r) => r.data),
  cancelAppointment: (id) => http.post(`/appointments/${id}/cancel`).then((r) => r.data),

  // google calendar
  googleSetupStatus: () => http.get('/integrations/google/setup').then((r) => r.data),
  googleSaveSetup: (payload) => http.post('/integrations/google/setup', payload).then((r) => r.data),
  googleConnect: () => http.get('/integrations/google/connect').then((r) => r.data),
  googleStatus: () => http.get('/integrations/google/status').then((r) => r.data),

  // meta test
  testMetaConnection: () => http.post('/integrations/meta/test').then((r) => r.data),

  // ai config
  getAIStatus: () => http.get('/ai-config/status').then((r) => r.data),
  toggleAI: () => http.post('/ai-config/toggle').then((r) => r.data),
  getAIConfig: () => http.get('/ai-config').then((r) => r.data),
  saveAIConfig: (payload) => http.put('/ai-config', payload).then((r) => r.data),
  testAIConfig: (message) => http.post('/ai-config/test', { message }).then((r) => r.data),
  uploadKnowledgeBase: (file) => {
    const fd = new FormData(); fd.append('file', file)
    return http.post('/ai-config/knowledge-base', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
  },
  removeKnowledgeBase: () => http.delete('/ai-config/knowledge-base').then((r) => r.data),

  // templates
  listTemplates: () => http.get('/templates').then((r) => r.data),
  listTemplateCategories: () => http.get('/templates/categories').then((r) => r.data.categories),
  createTemplateCategory: (name) => http.post('/templates/categories', { name }).then((r) => r.data.category),
  deleteTemplateCategory: (id) => http.delete(`/templates/categories/${id}`).then((r) => r.data),
  createTemplate: (payload) => http.post('/templates', payload).then((r) => r.data),
  updateTemplate: (id, payload) => http.patch(`/templates/${id}`, payload).then((r) => r.data),
  deleteTemplate: (id) => http.delete(`/templates/${id}`).then((r) => r.data),
  duplicateTemplate: (id) => http.post(`/templates/${id}/duplicate`).then((r) => r.data),
  testTemplate: (id, context) => http.post(`/templates/${id}/test`, { context }).then((r) => r.data),

  // leads — histórico de estágio
  leadHistory: (id) => http.get(`/leads/${id}/history`).then((r) => r.data),

  // custom apis
  listCustomApis: () => http.get('/custom-apis').then((r) => r.data),
  createCustomApi: (payload) => http.post('/custom-apis', payload).then((r) => r.data),
  updateCustomApi: (id, payload) => http.patch(`/custom-apis/${id}`, payload).then((r) => r.data),
  deleteCustomApi: (id) => http.delete(`/custom-apis/${id}`).then((r) => r.data),
  testCustomApi: (id, message) => http.post(`/custom-apis/${id}/test`, { message }).then((r) => r.data),

  // operators
  listOperators: () => http.get('/operators').then((r) => r.data),
  operatorsDashboard: () => http.get('/operators/dashboard').then((r) => r.data),
  createOperator: (payload) => http.post('/operators', payload).then((r) => r.data),
  updateOperator: (id, payload) => http.patch(`/operators/${id}`, payload).then((r) => r.data),
  deleteOperator: (id) => http.delete(`/operators/${id}`).then((r) => r.data),
  resetOperatorPassword: (id, password) => http.post(`/operators/${id}/reset-password`, { password }).then((r) => r.data),

  // broadcast
  listCampaigns: () => http.get('/broadcast/campaigns').then((r) => r.data),
  createCampaign: (payload) => http.post('/broadcast/campaigns', payload).then((r) => r.data),
  updateCampaign: (id, payload) => http.patch(`/broadcast/campaigns/${id}`, payload).then((r) => r.data),
  deleteCampaign: (id) => http.delete(`/broadcast/campaigns/${id}`).then((r) => r.data),
  sendCampaign: (id) => http.post(`/broadcast/campaigns/${id}/send`).then((r) => r.data),
  cancelCampaign: (id) => http.post(`/broadcast/campaigns/${id}/cancel`).then((r) => r.data),
  listBroadcastContacts: (campaignId) => http.get(`/broadcast/campaigns/${campaignId}/contacts`).then((r) => r.data),
  importContacts: (campaignId, contacts) => http.post(`/broadcast/campaigns/${campaignId}/contacts`, { contacts }).then((r) => r.data),
  importLeadsToCampaign: (campaignId, filters) => http.post(`/broadcast/campaigns/${campaignId}/import-leads`, filters).then((r) => r.data),
  removeBroadcastContact: (campaignId, contactId) => http.delete(`/broadcast/campaigns/${campaignId}/contacts/${contactId}`).then((r) => r.data),
  clearBroadcastContacts: (campaignId) => http.delete(`/broadcast/campaigns/${campaignId}/contacts`).then((r) => r.data),

  // admin — visão geral
  adminOverview: () => http.get('/admin/overview').then((r) => r.data.overview),

  // admin — clientes
  adminClients: () => http.get('/admin/clients').then((r) => r.data.clients),
  adminClient: (id) => http.get(`/admin/clients/${id}`).then((r) => r.data),
  adminCreateClient: (payload) => http.post('/admin/clients', payload).then((r) => r.data.client),
  adminUpdateClient: (id, payload) => http.patch(`/admin/clients/${id}`, payload).then((r) => r.data.client),
  adminUpdateFeatures: (id, features) => http.patch(`/admin/clients/${id}/features`, features).then((r) => r.data.client),
  adminUpdateStatus: (id, status) => http.patch(`/admin/clients/${id}/status`, { status }).then((r) => r.data.client),
  adminDeleteClient: (id) => http.delete(`/admin/clients/${id}`).then((r) => r.data),
  adminImpersonate: (clientId) =>
    http.post(`/admin/clients/${clientId}/impersonate`).then((r) => r.data),
  adminImpersonateUser: (userId) =>
    http.post(`/admin/users/${userId}/impersonate`).then((r) => r.data),

  // relatórios
  dailyReport: (date) => http.get('/reports/daily', { params: date ? { date } : {} }).then((r) => r.data),

  // admin — usuários
  adminUsers: (tenantId) =>
    http.get('/admin/users', { params: tenantId ? { tenant: tenantId } : {} }).then((r) => r.data.users),
  adminCreateUser: (tenantId, payload) =>
    http.post(`/admin/clients/${tenantId}/users`, payload).then((r) => r.data.user),
  adminUpdateUser: (id, payload) =>
    http.patch(`/admin/users/${id}`, payload).then((r) => r.data.user),
  adminDeleteUser: (id) => http.delete(`/admin/users/${id}`).then((r) => r.data),
  adminResetPassword: (id, password) =>
    http.post(`/admin/users/${id}/reset-password`, { password }).then((r) => r.data),

  // admin — superadmins (owners)
  adminListOwners: () => http.get('/admin/owners').then((r) => r.data.owners),
  adminCreateOwner: (payload) => http.post('/admin/owners', payload).then((r) => r.data.owner),
  adminDeleteOwner: (id) => http.delete(`/admin/owners/${id}`).then((r) => r.data),
  adminResetOwnerPassword: (id, password) =>
    http.post(`/admin/owners/${id}/reset-password`, { password }).then((r) => r.data),

  // contacts
  listContacts: (params) => http.get('/contacts', { params }).then((r) => r.data.contacts),
  createContact: (payload) => http.post('/contacts', payload).then((r) => r.data.contact),
  updateContact: (id, payload) => http.put(`/contacts/${id}`, payload).then((r) => r.data.contact),
  deleteContact: (id) => http.delete(`/contacts/${id}`).then((r) => r.data),
  exportContacts: () => `${http.defaults.baseURL}/contacts/export`,
  importContacts: (file) => {
    const fd = new FormData(); fd.append('file', file)
    return http.post('/contacts/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
  },
  deduplicateContacts: () => http.post('/contacts/deduplicate').then((r) => r.data),
  listContactTags: () => http.get('/contacts/tags').then((r) => r.data.tags),

  // channels
  listChannels: () => http.get('/channels').then((r) => r.data.channels),
  createChannel: (name) => http.post('/channels', { name }).then((r) => r.data.channel),
  getChannelQR: (id) => http.get(`/channels/${id}/qr`).then((r) => r.data),
  getChannelStatus: (id) => http.get(`/channels/${id}/status`).then((r) => r.data),
  renameChannel: (id, name) => http.patch(`/channels/${id}`, { name }).then((r) => r.data.channel),
  setDefaultChannel: (id) => http.patch(`/channels/${id}/default`).then((r) => r.data.channel),
  closeChannelTickets: (id, status) => http.post(`/channels/${id}/close-tickets`, { status }).then((r) => r.data),
  revalidateChannelWebhook: (id) => http.post(`/channels/${id}/revalidate-webhook`).then((r) => r.data),
  disconnectChannel: (id) => http.post(`/channels/${id}/disconnect`).then((r) => r.data),
  deleteChannel: (id) => http.delete(`/channels/${id}`).then((r) => r.data),
  updateChannelSettings: (id, payload) => http.patch(`/channels/${id}/settings`, payload).then((r) => r.data),

  // queues
  listQueues: () => http.get('/queues').then((r) => r.data),
  createQueue: (payload) => http.post('/queues', payload).then((r) => r.data),
  updateQueue: (id, payload) => http.patch(`/queues/${id}`, payload).then((r) => r.data),
  deleteQueue: (id) => http.delete(`/queues/${id}`).then((r) => r.data),

  // internal groups
  listInternalGroups: () => http.get('/internal-groups').then((r) => r.data),
  createInternalGroup: (payload) => http.post('/internal-groups', payload).then((r) => r.data),
  updateInternalGroup: (id, payload) => http.patch(`/internal-groups/${id}`, payload).then((r) => r.data),
  deleteInternalGroup: (id) => http.delete(`/internal-groups/${id}`).then((r) => r.data),
  listInternalMessages: (groupId, params) => http.get(`/internal-groups/${groupId}/messages`, { params }).then((r) => r.data),
  sendInternalMessage: (groupId, text) => http.post(`/internal-groups/${groupId}/messages`, { text }).then((r) => r.data),

  // chat — status de atendimento
  attendChat: (id) => http.post(`/chat/${id}/attend`).then((r) => r.data),
  resolveChat: (id) => http.post(`/chat/${id}/resolve`).then((r) => r.data),
  deleteConversation: (id) => http.delete(`/chat/${id}`).then((r) => r.data),
  reopenChat: (id) => http.post(`/chat/${id}/reopen`).then((r) => r.data),
  startChat: (payload) => http.post('/chat/start', payload).then((r) => r.data),
  listChatOperators: () => http.get('/chat/operators').then((r) => r.data.operators),
  getTicketLogs: (id) => http.get(`/chat/${id}/logs`).then((r) => r.data.logs),
  transferTicketTo: (id, userId) => http.post(`/chat/${id}/transfer-to`, { userId }).then((r) => r.data),
  listScheduledMessages: (id) => http.get(`/chat/${id}/schedule`).then((r) => r.data.scheduled),
  scheduleMessage: (id, payload) => http.post(`/chat/${id}/schedule`, payload).then((r) => r.data.scheduled),
  cancelScheduledMessage: (id, scheduleId) => http.delete(`/chat/${id}/schedule/${scheduleId}`).then((r) => r.data),

  // flows (chatbot)
  listFlows: () => http.get('/flows').then((r) => r.data.flows),
  getFlow: (id) => http.get(`/flows/${id}`).then((r) => r.data.flow),
  createFlow: (payload) => http.post('/flows', payload).then((r) => r.data.flow),
  updateFlow: (id, payload) => http.patch(`/flows/${id}`, payload).then((r) => r.data.flow),
  deleteFlow: (id) => http.delete(`/flows/${id}`).then((r) => r.data),
  getFlowSessions: (id) => http.get(`/flows/${id}/sessions`).then((r) => r.data.sessions),

  // admin — monitoramento
  adminMonitoring: (params) =>
    http.get('/admin/monitoring', { params }).then((r) => r.data),

  // admin — configurações
  adminSettings: () => http.get('/admin/settings').then((r) => r.data.settings),
}

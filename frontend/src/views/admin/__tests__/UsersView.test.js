import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { pluginOptions } from '@/test-utils/mountWithPlugins.js'

const mockState = vi.hoisted(() => ({ adminUsers: null, adminListOwners: null, adminCreateOwner: null }))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'owner-1', role: 'owner' } }),
}))

vi.mock('@/services/api', () => ({
  api: {
    adminUsers: (...a) => mockState.adminUsers(...a),
    adminListOwners: (...a) => mockState.adminListOwners(...a),
    adminCreateOwner: (...a) => mockState.adminCreateOwner(...a),
    adminUpdateUser: vi.fn(),
    adminResetPassword: vi.fn(),
    adminDeleteUser: vi.fn(),
    adminResetOwnerPassword: vi.fn(),
    adminDeleteOwner: vi.fn(),
  },
}))

const UsersView = (await import('../UsersView.vue')).default

describe('UsersView', () => {
  beforeEach(() => {
    mockState.adminUsers = vi.fn().mockResolvedValue([])
    mockState.adminListOwners = vi.fn().mockResolvedValue([])
    mockState.adminCreateOwner = vi.fn()
  })

  it('carrega e lista usuários e superadmins', async () => {
    mockState.adminUsers.mockResolvedValue([{ id: 'u1', name: 'Ana', email: 'ana@ex.com', role: 'admin', active: true, tenant: { name: 'Empresa' } }])
    mockState.adminListOwners.mockResolvedValue([{ id: 'o1', name: 'Dono', email: 'dono@ex.com' }])
    const wrapper = mount(UsersView, pluginOptions())
    await flushPromises()

    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('Dono')
  })

  it('mostra estado vazio quando não há superadmins', async () => {
    const wrapper = mount(UsersView, pluginOptions())
    await flushPromises()
    expect(wrapper.text()).toContain('Nenhum superadmin encontrado.')
  })

  it('filtra usuários pela busca', async () => {
    mockState.adminUsers.mockResolvedValue([
      { id: 'u1', name: 'Ana Souza', email: 'ana@ex.com', role: 'admin', active: true, tenant: null },
      { id: 'u2', name: 'Bia Lima', email: 'bia@ex.com', role: 'agent', active: true, tenant: null },
    ])
    const wrapper = mount(UsersView, pluginOptions())
    await flushPromises()

    await wrapper.find('input[placeholder*="Buscar por nome"]').setValue('ana')
    expect(wrapper.text()).toContain('Ana Souza')
    expect(wrapper.text()).not.toContain('Bia Lima')
  })
})

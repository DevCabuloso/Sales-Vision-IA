import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../config/index.js', () => ({
  config: { pipelineCrm: { apiBaseUrl: 'https://api.pipelinecrm.exemplo.com/api/v3' } },
}))

const { fetchDealStages } = await import('../pipelineCrm.js')

function mockFetchOnce({ ok = true, status = 200, body }) {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok, status, text: async () => JSON.stringify(body),
  })
}

describe('services/pipelineCrm', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('chama o endpoint certo com o Bearer token', async () => {
    const fetchMock = mockFetchOnce({ body: { deal_stages: [] } })
    await fetchDealStages('minha-api-key')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.pipelinecrm.exemplo.com/api/v3/deal_stages',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer minha-api-key' }) })
    )
  })

  it('normaliza estágios vindos em { deal_stages: [...] }', async () => {
    mockFetchOnce({
      body: { deal_stages: [
        { id: 1, name: 'Novo', position: 0, probability: 10, pipeline_id: 9, pipeline_name: 'Vendas' },
        { id: 2, name: 'Fechado', position: 1, probability: 100 },
      ] },
    })
    const stages = await fetchDealStages('key')
    expect(stages).toEqual([
      { externalId: '1', name: 'Novo', position: 0, probability: 10, pipelineExternalId: '9', pipelineName: 'Vendas' },
      { externalId: '2', name: 'Fechado', position: 1, probability: 100, pipelineExternalId: null, pipelineName: null },
    ])
  })

  it('normaliza estágios vindos como lista solta (sem envelope)', async () => {
    mockFetchOnce({ body: [{ id: 5, name: 'X' }] })
    const stages = await fetchDealStages('key')
    expect(stages).toEqual([{ externalId: '5', name: 'X', position: 0, probability: null, pipelineExternalId: null, pipelineName: null }])
  })

  it('usa índice como externalId/position/nome quando os campos faltam', async () => {
    mockFetchOnce({ body: [{}] })
    const stages = await fetchDealStages('key')
    expect(stages).toEqual([{ externalId: '0', name: 'Estágio 1', position: 0, probability: null, pipelineExternalId: null, pipelineName: null }])
  })

  it('lança erro com o corpo da resposta quando o Pipeline CRM retorna status de erro', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401, text: async () => '{"error":"unauthorized"}' })
    await expect(fetchDealStages('key-invalida')).rejects.toThrow(/401/)
  })

  it('lança erro claro quando o corpo não é JSON válido', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, text: async () => 'não é json' })
    await expect(fetchDealStages('key')).rejects.toThrow('não é JSON válido')
  })

  it('lança erro claro quando o corpo é JSON mas não tem o formato esperado', async () => {
    mockFetchOnce({ body: { algo: 'inesperado' } })
    await expect(fetchDealStages('key')).rejects.toThrow('Formato de resposta inesperado')
  })
})

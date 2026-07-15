import { Router } from 'express'
import { withTenant } from '../db/rls.js'
import { requireAuth, requireTenant } from '../middleware/auth.js'

export const pipelineStagesRouter = Router()
pipelineStagesRouter.use(requireAuth, requireTenant)

// GET /api/pipeline-stages — estágios importados do Pipeline CRM (ver
// POST /api/integrations/pipeline-crm/import-stages), usados pela aba
// "Pipeline CRM" do Kanban.
pipelineStagesRouter.get('/', async (req, res) => {
  try {
    const rows = await withTenant(req.user.tenantId, async (client) => {
      const r = await client.query(
        `SELECT id, external_id, name, position, probability, pipeline_external_id, pipeline_name
         FROM pipeline_stages WHERE tenant_id = $1
         ORDER BY position, name`,
        [req.user.tenantId]
      )
      return r.rows
    })
    res.json({ stages: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/**
 * Cria a conta do Super Admin (proprietário da plataforma) diretamente no banco.
 *
 * Uso:
 *   node scripts/create-owner.js <email> <senha> [nome]
 *
 * Exemplo:
 *   node scripts/create-owner.js admin@empresa.com MinhaS3nha "Karlos"
 */

import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'

const [, , email, senha, nome = 'Super Admin'] = process.argv

if (!email || !senha) {
  console.error('\n  Uso: node scripts/create-owner.js <email> <senha> [nome]\n')
  process.exit(1)
}

if (senha.length < 6) {
  console.error('\n  Erro: a senha deve ter pelo menos 6 caracteres.\n')
  process.exit(1)
}

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('\n  Erro: SUPABASE_URL e SUPABASE_SERVICE_KEY devem estar no .env\n')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})

const normalizedEmail = email.toLowerCase().trim()

// verifica se já existe
const { data: existing } = await supabase
  .from('users')
  .select('id, role')
  .eq('email', normalizedEmail)
  .limit(1)

if (existing?.length) {
  const u = existing[0]
  if (u.role === 'owner') {
    console.log(`\n  ✓ Já existe um owner com este e-mail (${normalizedEmail}).\n`)
  } else {
    console.error(`\n  Erro: já existe um usuário com role "${u.role}" e este e-mail.\n`)
  }
  process.exit(0)
}

const passwordHash = await bcrypt.hash(senha, 10)

const { data, error } = await supabase
  .from('users')
  .insert({
    tenant_id: null,
    email: normalizedEmail,
    password_hash: passwordHash,
    name: nome,
    role: 'owner',
    active: true,
  })
  .select('id, email, name, role')
  .single()

if (error) {
  console.error('\n  Erro ao criar owner:', error.message, '\n')
  process.exit(1)
}

console.log('\n  Super Admin criado com sucesso!')
console.log('  ────────────────────────────────')
console.log(`  ID:    ${data.id}`)
console.log(`  Nome:  ${data.name}`)
console.log(`  Email: ${data.email}`)
console.log(`  Role:  ${data.role}`)
console.log('\n  Acesse /login e selecione "Super Admin" para entrar.\n')

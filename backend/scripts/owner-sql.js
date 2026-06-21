// Uso: node scripts/owner-sql.js "seu@email.com" "suaSenha"
// Imprime o INSERT pronto (com hash bcrypt) para você rodar no banco.
import bcrypt from 'bcryptjs'

const [, , email, senha] = process.argv
if (!email || !senha) {
  console.error('Uso: node scripts/owner-sql.js "email" "senha"')
  process.exit(1)
}

const hash = await bcrypt.hash(senha, 10)
const sql = `INSERT INTO users (tenant_id, email, password_hash, name, role)
VALUES (NULL, '${email.toLowerCase().trim()}', '${hash}', 'Dono', 'owner');`

console.log('\n-- Rode este SQL no seu banco para criar o dono:\n')
console.log(sql)
console.log('')

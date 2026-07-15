// Config do PM2 para o backend. watch:false de propósito — o watch por arquivo já causou
// reinícios descontrolados durante deploys (cada arquivo sobrescrito pelo unzip disparava um
// restart próprio, derrubando o servidor por instantes e perdendo webhooks do WhatsApp que
// chegavam nesse meio-tempo). O deploy.ps1 já reinicia o processo explicitamente quando termina.
module.exports = {
  apps: [
    {
      name: 'backend',
      script: 'src/server.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      // NÃO aumente sem antes migrar os caches em memória de services/orchestrator.js
      // pra um store compartilhado (ex: Redis) — eles divergem entre instâncias.
      // src/utils/assertSingleInstance.js crasha o boot de qualquer instância > 0
      // como rede de segurança caso isso mude sem querer.
      instances: 1,
      // Explícito de propósito: o padrão do PM2 pra exec_mode mudou entre versões
      // (uma atualização de 7.0.1→7.0.3 fez o processo subir em "cluster" em vez
      // de "fork" sem essa linha) — cluster usa IPC/modelo de processo diferente
      // do fork, e o resto do código (caches em memória, assertSingleInstance)
      // foi desenhado assumindo fork. Não depender do default da versão do PM2.
      exec_mode: 'fork',
    },
  ],
}

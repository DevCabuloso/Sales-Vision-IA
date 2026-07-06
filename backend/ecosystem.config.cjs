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
    },
  ],
}

<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-5 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold mb-1">Central de Ajuda</h1>
        <p class="text-body-2" style="color:#9FB0BC">Guias rápidos sobre cada área da plataforma</p>
      </div>
      <v-text-field
        v-model="search"
        placeholder="Buscar artigos, dúvidas, palavras-chave..."
        prepend-inner-icon="mdi-magnify"
        density="compact"
        hide-details
        clearable
        style="max-width:320px"
      />
    </div>

    <!-- ═══ CORPO: sidebar + conteúdo ═══ -->
    <div class="help-body">
      <aside class="help-sidebar">
        <span class="help-sidebar-label">CATEGORIAS</span>
        <button
          v-for="s in sections" :key="s.title"
          class="help-cat-item"
          :class="{ active: !search.trim() && activeCategory === s.title }"
          @click="selectCategory(s.title)"
        >
          <div class="help-cat-icon"><v-icon :icon="s.icon" size="16" /></div>
          <span class="help-cat-title">{{ s.title }}</span>
          <span class="help-cat-count">{{ s.items.length }}</span>
        </button>
      </aside>

      <main class="help-content">
        <template v-if="search.trim()">
          <div class="help-content-header">
            <span class="help-content-eyebrow">RESULTADOS</span>
            <h2 class="help-content-title">{{ flatMatches.length }} resultado(s) para "{{ search }}"</h2>
          </div>

          <div v-if="!flatMatches.length" class="help-empty">
            <v-icon icon="mdi-file-search-outline" size="48" style="opacity:.25" class="mb-3" />
            <p class="text-body-2" style="color:var(--text-muted)">Nenhum artigo encontrado. Tente outra palavra-chave.</p>
          </div>

          <v-expansion-panels v-else variant="accordion" multiple class="help-panels">
            <v-expansion-panel v-for="m in flatMatches" :key="m.category + m.q">
              <v-expansion-panel-title>
                <div>
                  <span class="help-result-cat">{{ m.category }}</span>
                  <div class="text-body-2 font-weight-bold">{{ m.q }}</div>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text class="help-answer">{{ m.a }}</v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </template>

        <template v-else>
          <div class="help-content-header">
            <span class="help-content-eyebrow">CATEGORIA</span>
            <h2 class="help-content-title">
              <v-icon :icon="activeSection.icon" size="20" color="primary" class="mr-1" />
              {{ activeSection.title }}
            </h2>
          </div>

          <v-expansion-panels variant="accordion" multiple class="help-panels">
            <v-expansion-panel v-for="item in activeSection.items" :key="item.q">
              <v-expansion-panel-title class="text-body-2 font-weight-bold">{{ item.q }}</v-expansion-panel-title>
              <v-expansion-panel-text class="help-answer">{{ item.a }}</v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </template>
      </main>
    </div>

    <v-card class="glass pa-5 text-center mt-6" border>
      <v-icon icon="mdi-account-question-outline" size="28" style="opacity:.5" class="mb-2" />
      <p class="text-body-2 mb-0" style="color:var(--text-muted)">
        Não encontrou o que precisava? Fale com o administrador da sua operação para ajustes de acesso e configuração.
      </p>
    </v-card>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const search = ref('')

const sections = [
  {
    title: 'Primeiros passos',
    icon: 'mdi-rocket-launch-outline',
    items: [
      { q: 'O que é a plataforma?', a: 'Uma central de atendimento e vendas via WhatsApp: você conecta seus números, conversa com leads pelo Chat, acompanha o funil no Kanban e pode automatizar respostas com IA e Chat Flow.' },
      { q: 'Por onde eu começo?', a: '1) Conecte um canal em Canais.\n2) Configure a IA (opcional) em Config. da IA.\n3) Acompanhe as conversas em Chat e o funil em Kanban.\n4) Use Templates para respostas rápidas e Broadcast para campanhas.' },
      { q: 'O que aparece no Dashboard?', a: 'O resumo diário da operação: volume de conversas, leads e indicadores de desempenho do dia, além do relatório diário que pode ser baixado.' },
    ],
  },
  {
    title: 'Canais & WhatsApp',
    icon: 'mdi-cellphone-wireless',
    items: [
      { q: 'Como conecto um número de WhatsApp?', a: 'Vá em Canais > Novo Canal. Você pode conectar via Evolution (QR Code) ou via Meta API (WhatsApp Business oficial), dependendo do que estiver liberado para sua conta.' },
      { q: 'Posso ter mais de um canal conectado?', a: 'Sim. Cada canal aparece separadamente em Canais, e você pode renomear, ver tickets abertos ou excluir um canal quando não precisar mais dele.' },
      { q: 'O que fazer se um canal cair ou desconectar?', a: 'Abra Canais, localize o canal desconectado e refaça a conexão (novo QR Code para Evolution). Se o problema persistir, confira a Integração correspondente em Integrações.' },
    ],
  },
  {
    title: 'Chat & Atendimento',
    icon: 'mdi-chat-outline',
    items: [
      { q: 'Como falo com um lead que ainda não me chamou?', a: 'No Chat, clique em "Iniciar Conversa Avulsa", informe o número com DDD e, se quiser, uma mensagem inicial.' },
      { q: 'Como transfiro um atendimento para outro operador?', a: 'Abra a conversa, use a opção "Transferir Atendimento" e escolha o operador ou fila de destino.' },
      { q: 'O que são filas e etiquetas?', a: 'Em Atendimento você organiza o suporte em filas (grupos de atendimento) e etiquetas (marcadores de conversa), além de definir o horário de atendimento da equipe.' },
      { q: 'Dá para excluir conversas?', a: 'Sim, selecione uma ou mais conversas na lista do Chat e use a opção de excluir/deletar.' },
    ],
  },
  {
    title: 'Kanban & Leads',
    icon: 'mdi-view-column-outline',
    items: [
      { q: 'Para que serve o Kanban?', a: 'É o funil visual de vendas (CRM Kanban): cada card é um lead, e você arrasta entre as colunas conforme ele avança na negociação.' },
      { q: 'O que é o "score de qualificação"?', a: 'Uma nota de 0 a 100 que indica o quão qualificado um lead está, ajudando a priorizar quem atender primeiro.' },
      { q: 'Qual a diferença entre Leads e Contatos?', a: 'Leads são oportunidades de venda em andamento (aparecem no funil). Contatos é sua base geral de pessoas/telefones, usada inclusive para importação e campanhas de Broadcast.' },
    ],
  },
  {
    title: 'Contatos & Grupos',
    icon: 'mdi-contacts-outline',
    items: [
      { q: 'Como importo minha lista de contatos?', a: 'Em Contatos, use o botão de importação para subir uma lista (planilha/CSV) com nomes e telefones.' },
      { q: 'O que são os Grupos internos?', a: 'É uma forma de organizar sua própria equipe/contatos internos em grupos, separado da base de leads e contatos de clientes.' },
    ],
  },
  {
    title: 'Agenda',
    icon: 'mdi-calendar-clock-outline',
    items: [
      { q: 'A Agenda sincroniza com o Google Calendar?', a: 'Sim, se você conectar a integração do Google Calendar em Integrações, as reuniões marcadas com leads aparecem também no seu calendário do Google.' },
      { q: 'Como vejo os compromissos do mês?', a: 'A tela de Agenda mostra o calendário mensal e a lista de reuniões agendadas para o período selecionado.' },
    ],
  },
  {
    title: 'Templates & Broadcast',
    icon: 'mdi-file-document-multiple-outline',
    items: [
      { q: 'Como uso variáveis nos templates?', a: 'Ao criar um template em Templates, use chaves duplas, por exemplo {{nome}}, que serão substituídas automaticamente pelos dados do lead ao enviar.' },
      { q: 'Dá para testar um template antes de usar?', a: 'Sim, use o botão "Testar" no card do template: a IA gera uma prévia do resultado com base num contexto de exemplo que você fornecer.' },
      { q: 'Como funciona o Broadcast?', a: 'Em Broadcast você cria campanhas de envio em massa para uma lista de contatos e acompanha enviadas, entregues, lidas e respondidas em tempo real.' },
    ],
  },
  {
    title: 'Chat Flow (automação)',
    icon: 'mdi-robot-outline',
    items: [
      { q: 'O que é o Chat Flow?', a: 'É o construtor visual de fluxos de conversa automatizados: você monta nós de mensagens, condições e opções para guiar o atendimento sem intervenção manual.' },
      { q: 'Como crio um novo fluxo?', a: 'Em Chat Flow, clique para criar um novo fluxo, abra o editor visual e conecte os nós de mensagem/opções na ordem desejada.' },
    ],
  },
  {
    title: 'Inteligência Artificial',
    icon: 'mdi-robot-happy-outline',
    items: [
      { q: 'Como ligo/desligo a IA?', a: 'Use o botão "IA Ativada/Desativada" no menu lateral. Com a IA desligada, as respostas passam a ser 100% manuais pelos operadores.' },
      { q: 'O que configuro em Config. da IA?', a: 'A identidade do assistente (nome, tom de voz), o Prompt de Sistema (regras gerais) e o Prompt Principal (instruções de atendimento). Você também pode testar a IA antes de publicar.' },
    ],
  },
  {
    title: 'Usuários & Permissões',
    icon: 'mdi-account-group-outline',
    items: [
      { q: 'Como adiciono um novo operador?', a: 'Em Usuários, crie um novo operador informando os dados de acesso; depois é possível redefinir a senha ou excluir o usuário quando necessário.' },
      { q: 'Consigo ver o desempenho de cada operador?', a: 'Sim, o card de cada operador mostra mensagens enviadas, leads criados, agendamentos feitos e atendimentos assumidos manualmente.' },
    ],
  },
  {
    title: 'Integrações & Configurações',
    icon: 'mdi-puzzle-outline',
    items: [
      { q: 'Quais integrações estão disponíveis?', a: 'Google Calendar (agenda), WhatsApp via Meta API e WhatsApp via Evolution, gerenciadas em Integrações.' },
      { q: 'Para que servem as APIs Customizadas?', a: 'Permitem conectar chamadas HTTP externas ao seu fluxo de automação/IA, para integrar com sistemas próprios da empresa.' },
      { q: 'Onde altero idioma, senha e dados da empresa?', a: 'Em Configurações você edita os dados da empresa, troca sua senha e escolhe o idioma da interface.' },
      { q: 'O que tem em Operação?', a: 'Ajustes como timeout de inatividade, controle de agentes, permissões de visibilidade entre operadores e comportamento do bot.' },
    ],
  },
]

const activeCategory = ref(sections[0].title)
const activeSection = computed(() => sections.find((s) => s.title === activeCategory.value) || sections[0])
function selectCategory(title) { activeCategory.value = title; search.value = '' }

const flatMatches = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return []
  return sections.flatMap((s) => s.items.filter((i) => (i.q + ' ' + i.a).toLowerCase().includes(q)).map((i) => ({ ...i, category: s.title })))
})
</script>

<style scoped>
/* ─── Corpo ─── */
.help-body { display: flex; align-items: flex-start; gap: 20px; }

.help-sidebar {
  flex: 0 0 220px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: sticky;
  top: 0;
}
.help-sidebar-label {
  font-size: 10px; font-weight: 700; letter-spacing: 1px;
  color: var(--text-faint);
  padding: 0 10px 8px;
}
.help-cat-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 10px;
  background: none; border: none; cursor: pointer;
  text-align: left; color: var(--text-muted);
  transition: all 0.15s ease;
}
.help-cat-item:hover { background: var(--panel-hover); color: var(--text-primary); }
.help-cat-item.active { background: rgba(99,102,241,0.12); color: #818CF8; }
.help-cat-icon {
  width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--panel-bg);
}
.help-cat-item.active .help-cat-icon { background: rgba(99,102,241,0.2); color: #818CF8; }
.help-cat-title { font-size: 13px; font-weight: 500; flex: 1; }
.help-cat-count {
  font-size: 11px; font-weight: 600; color: var(--text-faint);
  background: var(--panel-bg); border-radius: 20px; padding: 1px 7px;
}

.help-content { flex: 1; min-width: 0; }
.help-content-header { margin-bottom: 12px; }
.help-content-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 1px; color: var(--text-faint); }
.help-content-title { font-size: 18px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; margin-top: 2px; }

.help-panels { border-radius: 12px; overflow: hidden; border: 1px solid var(--border-subtle); }
.help-answer { color: var(--text-muted); white-space: pre-line; }
.help-result-cat {
  display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .5px;
  color: #818CF8; background: rgba(99,102,241,0.12);
  border-radius: 6px; padding: 1px 7px; margin-bottom: 4px;
}
.help-empty { text-align: center; padding: 48px 16px; }

/* ─── Mobile ─── */
@media (max-width: 900px) {
  .help-body { flex-direction: column; }
  .help-sidebar {
    flex-direction: row;
    overflow-x: auto;
    width: 100%;
    position: static;
    gap: 6px;
    padding-bottom: 4px;
  }
  .help-sidebar-label { display: none; }
  .help-cat-item { flex-shrink: 0; }
  .help-cat-title { white-space: nowrap; }
}
</style>
